import { inArray } from "../db/filters.js";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { entities, entityTags, tags } from "../db/schema/index.js";
import { tagInsertSchema } from "../db/validation.js";
import { conflict, notFound } from "../lib/errors.js";

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
        .orderBy(asc(tags.name));

      return c.json({ items: items.filter(tag => !q || tag.name.toLowerCase().includes(q.trim().toLowerCase())) });
    }
  )
  .post(
    "/tags",
    zValidator("json", tagInsertSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");
      const tag = db.insert(tags).values(data).onConflictDoNothing({ target: tags.name }).returning().get();
      if (!tag) throw conflict("Tag already exists");
      return c.json({ tag }, 201);
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

      await db.transaction((tx) => {
        tx.delete(entityTags).where(eq(entityTags.entityId, id)).run();
        if (tagIds.length > 0) {
          // FK constraints ensure tag IDs are valid.
          for (const tagId of tagIds) tx.insert(entityTags).values({ entityId: id, tagId }).onConflictDoNothing().run();
        }
      });

      return c.json({ entityId: id, tagIds });
    }
  );

