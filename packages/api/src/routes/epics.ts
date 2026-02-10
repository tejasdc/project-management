import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { epics } from "../db/schema/index.js";
import { epicInsertSchema } from "../db/validation.js";
import { notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor, parseLimit, parseOptionalBoolean } from "../lib/pagination.js";
import { tryPublishEvent } from "../services/events.js";

const listEpicsQuerySchema = z.object({
  projectId: z.string().uuid(),
  includeDeleted: z.string().optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

type EpicsCursor = { updatedAt: string; id: string };

const epicIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const epicPatchSchema = epicInsertSchema.pick({ name: true, description: true, deletedAt: true }).partial();

export const epicRoutes = new Hono<AppEnv>()
  .get(
    "/",
    zValidator("query", listEpicsQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");
      const includeDeleted = parseOptionalBoolean(q.includeDeleted) ?? false;
      const limit = parseLimit(q.limit);
      const cursor = q.cursor ? decodeCursor<EpicsCursor>(q.cursor) : null;

      const where: any[] = [eq(epics.projectId, q.projectId)];
      if (!includeDeleted) where.push(isNull(epics.deletedAt));

      if (cursor) {
        const t = new Date(cursor.updatedAt);
        where.push(
          // older updatedAt, or same updatedAt + lower id (desc ordering)
          or(
            lt(epics.updatedAt, t),
            and(eq(epics.updatedAt, t), lt(epics.id, cursor.id))
          )
        );
      }

      const rows = await db
        .select()
        .from(epics)
        .where(and(...where))
        .orderBy(desc(epics.updatedAt), desc(epics.id))
        .limit(limit + 1);

      const items = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      const last = hasMore ? items[items.length - 1] : null;
      const nextCursor = last ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id } satisfies EpicsCursor) : null;

      return c.json({ items, nextCursor });
    }
  )
  .post(
    "/",
    zValidator("json", epicInsertSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");
      const [epic] = await db.insert(epics).values(data as any).returning();
      await tryPublishEvent("epic:created", { id: epic.id, projectId: epic.projectId });
      return c.json({ epic }, 201);
    }
  )
  .patch(
    "/:id",
    zValidator("param", epicIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", epicPatchSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [epic] = await db.update(epics).set(patch as any).where(eq(epics.id, id)).returning();
      if (!epic) throw notFound("epic", id);
      await tryPublishEvent("epic:updated", { id: epic.id, projectId: epic.projectId });
      return c.json({ epic });
    }
  );
