import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import { REVIEW_TYPES, REVIEW_STATUSES, reviewResolveSchema } from "@pm/shared";
import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { reviewQueue } from "../db/schema/index.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination.js";
import { resolveReviewBatch, resolveReviewItem } from "../services/review.js";

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

      const rows = await db
        .select()
        .from(reviewQueue)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(reviewQueue.createdAt), desc(reviewQueue.id))
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

      return c.json(res);
    }
  );

