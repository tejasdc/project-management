import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, ilike, isNull, lte, lt, or } from "drizzle-orm";

import { NOTE_SOURCES, captureNoteSchema } from "@pm/shared";
import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { rawNotes } from "../db/schema/index.js";
import { notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor, parseLimit, parseOptionalBoolean } from "../lib/pagination.js";
import { captureNote, markNoteForReprocess } from "../services/capture.js";

const noteIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listNotesQuerySchema = z.object({
  processed: z.string().optional(),
  source: z.enum(NOTE_SOURCES).optional(),
  capturedBy: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

type NotesCursor = { capturedAt: string; id: string };

export const noteRoutes = new Hono<AppEnv>()
  .post(
    "/capture",
    zValidator("json", captureNoteSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const input = c.req.valid("json");
      const user = c.get("user");

      const res = await captureNote({
        input,
        capturedByUserId: user.id,
      });

      return c.json(
        { note: res.note, deduped: res.deduped },
        res.deduped ? 200 : 201
      );
    }
  )
  .get(
    "/",
    zValidator("query", listNotesQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");

      const limit = parseLimit(q.limit);
      const cursor = q.cursor ? decodeCursor<NotesCursor>(q.cursor) : null;

      const where: any[] = [];

      const processed = parseOptionalBoolean(q.processed);
      if (processed !== undefined) where.push(eq(rawNotes.processed, processed));
      if (q.source) where.push(eq(rawNotes.source, q.source));
      if (q.capturedBy) where.push(eq(rawNotes.capturedBy, q.capturedBy));
      if (q.since) where.push(gte(rawNotes.capturedAt, new Date(q.since)));
      if (q.until) where.push(lte(rawNotes.capturedAt, new Date(q.until)));

      if (cursor) {
        const t = new Date(cursor.capturedAt);
        where.push(
          or(
            lt(rawNotes.capturedAt, t),
            and(eq(rawNotes.capturedAt, t), lt(rawNotes.id, cursor.id))
          )
        );
      }

      const items = await db
        .select()
        .from(rawNotes)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(rawNotes.capturedAt), desc(rawNotes.id))
        .limit(limit + 1);

      const pageItems = items.slice(0, limit);
      const next = items.length > limit ? items[limit - 1] : null;

      const nextCursor = next
        ? encodeCursor({ capturedAt: next.capturedAt.toISOString(), id: next.id } satisfies NotesCursor)
        : null;

      return c.json({ items: pageItems, nextCursor });
    }
  )
  .post(
    "/:id/reprocess",
    zValidator("param", noteIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");

      const user = c.get("user");
      const row = await markNoteForReprocess({ rawNoteId: id, requestedByUserId: user.id });
      if (!row) throw notFound("raw_note", id);

      return c.json({ ok: true }, 202);
    }
  );
