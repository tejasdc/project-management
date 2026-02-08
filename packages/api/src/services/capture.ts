import { and, eq } from "drizzle-orm";

import type { NoteSource, SourceMeta } from "@pm/shared";
import { db } from "../db/index.js";
import { rawNotes } from "../db/schema/index.js";
import { serviceUnavailable } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_JOB_OPTS, getNotesExtractQueue, getNotesReprocessQueue } from "../jobs/queue.js";

export type CaptureNoteInput = {
  content: string;
  source: NoteSource;
  sourceMeta?: SourceMeta;
  capturedAt?: string;
  externalId?: string;
};

function isUniqueViolation(err: unknown) {
  // postgres-js throws PostgresError with a string code like "23505".
  return typeof err === "object" && err !== null && "code" in err && (err as any).code === "23505";
}

export async function captureNote(opts: { input: CaptureNoteInput; capturedByUserId: string }) {
  const { input, capturedByUserId } = opts;

  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : undefined;

  const values = {
    content: input.content,
    source: input.source,
    sourceMeta: input.sourceMeta,
    externalId: input.externalId,
    capturedBy: capturedByUserId,
    ...(capturedAt ? { capturedAt } : {}),
  };

  let note: typeof rawNotes.$inferSelect;
  let deduped = false;
  const jitter = () => Math.floor(Math.random() * 500);

  if (input.externalId) {
    try {
      const [row] = await db.insert(rawNotes).values(values).returning();
      note = row!;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      const existing = await db.query.rawNotes.findFirst({
        where: (t, { and, eq }) => and(eq(t.source, input.source), eq(t.externalId, input.externalId!)),
      });
      if (!existing) throw err;

      note = existing;
      deduped = true;
    }
  } else {
    const [row] = await db.insert(rawNotes).values(values).returning();
    note = row!;
  }

  if (!deduped && !note.processed) {
    const queue = getNotesExtractQueue();
    if (!queue) {
      logger.warn({ rawNoteId: note.id }, "Redis unavailable — note saved but extraction not queued");
    } else {
      try {
        await queue.add(
          "notes-extract",
          { rawNoteId: note.id },
          {
            ...DEFAULT_JOB_OPTS,
            jobId: note.id,
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 + jitter() },
          }
        );
      } catch (err) {
        await db
          .update(rawNotes)
          .set({ processingError: `enqueue_failed: ${err instanceof Error ? err.message : String(err)}` })
          .where(eq(rawNotes.id, note.id));
        throw serviceUnavailable("Failed to enqueue note extraction");
      }
    }
  }

  return { note, deduped };
}

export async function markNoteForReprocess(opts: { rawNoteId: string; requestedByUserId?: string }) {
  const { rawNoteId, requestedByUserId } = opts;
  const jitter = () => Math.floor(Math.random() * 500);

  const note = await db.query.rawNotes.findFirst({
    where: (t, { eq }) => eq(t.id, rawNoteId),
  });
  if (!note) return null;

  const queue = getNotesReprocessQueue();
  if (!queue) {
    throw serviceUnavailable("Redis unavailable — cannot reprocess notes");
  }

  try {
    await queue.add(
      "notes-reprocess",
      { rawNoteId, requestedByUserId },
      {
        ...DEFAULT_JOB_OPTS,
        jobId: rawNoteId,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 + jitter() },
      }
    );
  } catch (err) {
    await db
      .update(rawNotes)
      .set({ processingError: `enqueue_failed: ${err instanceof Error ? err.message : String(err)}` })
      .where(eq(rawNotes.id, rawNoteId));
    throw serviceUnavailable("Failed to enqueue note reprocessing");
  }

  return note;
}
