import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { epics } from "../db/schema/index.js";
import { epicInsertSchema } from "../db/validation.js";
import { notFound } from "../lib/errors.js";
import { parseOptionalBoolean } from "../lib/pagination.js";

const listEpicsQuerySchema = z.object({
  projectId: z.string().uuid(),
  includeDeleted: z.string().optional(),
});

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

      const where: any[] = [eq(epics.projectId, q.projectId)];
      if (!includeDeleted) where.push(isNull(epics.deletedAt));

      const items = await db
        .select()
        .from(epics)
        .where(and(...where))
        .orderBy(desc(epics.updatedAt), desc(epics.createdAt));

      return c.json({ items });
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
      return c.json({ epic });
    }
  );

