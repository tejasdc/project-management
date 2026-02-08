import type { Job } from "bullmq";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { entityEvents, entitySources, rawNotes } from "../db/schema/index.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_JOB_OPTS, notesExtractQueue, type NotesReprocessJob } from "./queue.js";

export async function notesReprocessProcessor(job: Job<NotesReprocessJob>) {
  const { rawNoteId, requestedByUserId } = job.data;

  const note = await db.query.rawNotes.findFirst({
    where: (t, { eq }) => eq(t.id, rawNoteId),
  });
  if (!note) return;

  await db.transaction(async (tx) => {
    await tx
      .update(rawNotes)
      .set({ processed: false, processedAt: null, processingError: null })
      .where(eq(rawNotes.id, rawNoteId));

    const links = await tx
      .select({ entityId: entitySources.entityId })
      .from(entitySources)
      .where(eq(entitySources.rawNoteId, rawNoteId));

    for (const l of links) {
      await tx.insert(entityEvents).values({
        entityId: l.entityId,
        type: "reprocess",
        actorUserId: requestedByUserId ?? null,
        rawNoteId,
        body: null,
        meta: { jobId: String(job.id ?? ""), reason: "note_reprocess" } as any,
      } as any);
    }
  });

  try {
    await notesExtractQueue.add(
      "notes:extract",
      { rawNoteId },
      {
        ...DEFAULT_JOB_OPTS,
        jobId: rawNoteId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      }
    );
  } catch (err) {
    logger.error({ err, rawNoteId, jobId: job.id }, "Failed to enqueue notes:extract after reprocess");
    throw err;
  }
}

