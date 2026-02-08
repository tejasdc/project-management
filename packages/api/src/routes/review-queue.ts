import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import { REVIEW_TYPES, REVIEW_STATUSES, reviewResolveSchema } from "@pm/shared";
import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { entities, reviewQueue } from "../db/schema/index.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination.js";
import { resolveReviewBatch, resolveReviewItem } from "../services/review.js";
import { tryPublishEvent } from "../services/events.js";

const reviewIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listReviewQueueQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  projectId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  reviewType: z.enum(REVIEW_TYPES).optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

type ReviewCursor = { createdAt: string; id: string };

const countReviewQueueQuerySchema = listReviewQueueQuerySchema.pick({
  status: true,
  projectId: true,
  entityId: true,
  reviewType: true,
});

const batchResolveSchema = z.object({
  resolutions: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["accepted", "rejected", "modified"] as const),
      userResolution: reviewResolveSchema.shape.userResolution.optional(),
      trainingComment: z.string().optional(),
    })
  ),
});

export const reviewQueueRoutes = new Hono<AppEnv>()
  .get(
    "/count",
    zValidator("query", countReviewQueueQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");

      const where: any[] = [];
      if (q.status) where.push(eq(reviewQueue.status, q.status));
      if (q.projectId) where.push(eq(reviewQueue.projectId, q.projectId));
      if (q.entityId) where.push(eq(reviewQueue.entityId, q.entityId));
      if (q.reviewType) where.push(eq(reviewQueue.reviewType, q.reviewType));

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewQueue)
        .where(where.length ? and(...where) : undefined);

      return c.json({ count: row?.count ?? 0 });
    }
  )
  .get(
    "/",
    zValidator("query", listReviewQueueQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");
      const limit = parseLimit(q.limit);
      const cursor = q.cursor ? decodeCursor<ReviewCursor>(q.cursor) : null;

      const where: any[] = [];
      if (q.status) where.push(eq(reviewQueue.status, q.status));
      if (q.projectId) where.push(eq(reviewQueue.projectId, q.projectId));
      if (q.entityId) where.push(eq(reviewQueue.entityId, q.entityId));
      if (q.reviewType) where.push(eq(reviewQueue.reviewType, q.reviewType));

      if (cursor) {
        const t = new Date(cursor.createdAt);
        where.push(
          or(
            lt(reviewQueue.createdAt, t),
            and(eq(reviewQueue.createdAt, t), lt(reviewQueue.id, cursor.id))
          )
        );
      }

      const reviewTypeOrder = sql<number>`
        case ${reviewQueue.reviewType}
          when 'type_classification' then 1
          when 'project_creation' then 2
          when 'project_assignment' then 3
          when 'epic_creation' then 4
          when 'epic_assignment' then 5
          when 'assignee_suggestion' then 6
          when 'duplicate_detection' then 7
          else 50
        end
      `;

      const entityGroupRank = sql<number>`case when ${reviewQueue.entityId} is null then 0 else 1 end`;
      const projectKey = sql<string>`coalesce(${reviewQueue.projectId}::text, 'ffffffff-ffff-ffff-ffff-ffffffffffff')`;
      const entityKey = sql<string>`coalesce(${reviewQueue.entityId}::text, '')`;

      const rows = await db
        .select()
        .from(reviewQueue)
        .where(where.length ? and(...where) : undefined)
        // Default batching order (project -> entity -> dependency order).
        // If a cursor is provided, we preserve the older cursor semantics (createdAt/id) to avoid breaking pagination.
        .orderBy(
          cursor ? desc(reviewQueue.createdAt) : projectKey,
          cursor ? desc(reviewQueue.id) : entityGroupRank,
          cursor ? desc(reviewQueue.id) : entityKey,
          cursor ? desc(reviewQueue.id) : reviewTypeOrder,
          cursor ? desc(reviewQueue.createdAt) : reviewQueue.createdAt,
          cursor ? desc(reviewQueue.id) : reviewQueue.id
        )
        .limit(limit + 1);

      const items = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      const last = hasMore ? items[items.length - 1] : null;
      const nextCursor = last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id } satisfies ReviewCursor)
        : null;

      return c.json({ items, nextCursor });
    }
  )
  .post(
    "/:id/resolve",
    zValidator("param", reviewIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", reviewResolveSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const user = c.get("user");

      const res = await resolveReviewItem({
        id,
        status: body.status,
        userResolution: body.userResolution as any,
        trainingComment: body.trainingComment,
        resolvedByUserId: user.id,
      });

      // Fire-and-forget: publish SSE events in background so the HTTP response is instant.
      void (async () => {
        try {
          await tryPublishEvent("review_queue:resolved", {
            id: res.item.id,
            status: res.item.status,
            reviewType: res.item.reviewType,
            entityId: res.item.entityId,
            projectId: res.item.projectId,
          });
          for (const entityId of res.effects.updatedEntityIds) {
            await tryPublishEvent("entity:updated", { id: entityId, via: "review_queue:resolved", reviewId: res.item.id });
          }
          const projectIds = new Set<string>();
          if (res.item.projectId) projectIds.add(res.item.projectId);
          if (res.effects.createdProjectId) projectIds.add(res.effects.createdProjectId);
          for (const eid of res.effects.updatedEntityIds) {
            const ent = await db.query.entities.findFirst({ where: (t, q) => q.eq(t.id, eid) });
            if (ent?.projectId) projectIds.add(ent.projectId);
          }
          for (const pid of projectIds) {
            await tryPublishEvent("project:stats_updated", { projectId: pid });
          }
        } catch { /* SSE events are best-effort */ }
      })();

      return c.json(res);
    }
  )
  .post(
    "/resolve-batch",
    zValidator("json", batchResolveSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const body = c.req.valid("json");
      const user = c.get("user");

      const res = await resolveReviewBatch({
        resolutions: body.resolutions as any,
        resolvedByUserId: user.id,
      });

      // Emit per-item resolved events for parity with single resolution.
      for (const item of res.items) {
        await tryPublishEvent("review_queue:resolved", {
          id: item.id,
          status: item.status,
          reviewType: item.reviewType,
          entityId: item.entityId,
          projectId: item.projectId,
        });
        if (item.projectId) await tryPublishEvent("project:stats_updated", { projectId: item.projectId });
      }

      return c.json(res);
    }
  );
