import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, ilike, inArray } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { entities, entityTags, tags } from "../db/schema/index.js";
import { tagInsertSchema } from "../db/validation.js";
import { conflict, notFound } from "../lib/errors.js";

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as any).code === "23505";
}

const listTagsQuerySchema = z.object({
  q: z.string().optional(),
});

const entityIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const replaceEntityTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

export const tagRoutes = new Hono<AppEnv>()
  .get(
    "/tags",
    zValidator("query", listTagsQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { q } = c.req.valid("query");
      const items = await db
        .select()
        .from(tags)
        .where(q ? ilike(tags.name, `%${q.trim().toLowerCase()}%`) : undefined)
        .orderBy(asc(tags.name));

      return c.json({ items });
    }
  )
  .post(
    "/tags",
    zValidator("json", tagInsertSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");
      try {
        const [tag] = await db.insert(tags).values(data as any).returning();
        return c.json({ tag }, 201);
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict("Tag already exists");
        throw err;
      }
    }
  )
  .put(
    "/entities/:id/tags",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", replaceEntityTagsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { tagIds } = c.req.valid("json");

      const entity = await db.query.entities.findFirst({ where: (t, { eq }) => eq(t.id, id) });
      if (!entity) throw notFound("entity", id);

      await db.transaction(async (tx) => {
        await tx.delete(entityTags).where(eq(entityTags.entityId, id));
        if (tagIds.length > 0) {
          // FK constraints ensure tag IDs are valid.
          await tx
            .insert(entityTags)
            .values(tagIds.map((tagId) => ({ entityId: id, tagId })) as any)
            .onConflictDoNothing();
        }
      });

      return c.json({ entityId: id, tagIds });
    }
  );

