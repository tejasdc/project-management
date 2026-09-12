import { and, eq } from "drizzle-orm";
import type { NoteSource, SourceMeta } from "@pm/shared";
import { db } from "../db/index.js";
import { rawNotes, processingJobs, entitySources, entityEvents } from "../db/schema/index.js";
import { getRuntime } from "../runtime.js";
import { hydrateNote, writeNotePayload } from "./note-payload.js";
import { tryPublishEvent } from "./events.js";
export type CaptureNoteInput = {
  content: string; source: NoteSource; sourceMeta?: SourceMeta; capturedAt?: string; externalId?: string;
};
export async function captureNote(opts: { input: CaptureNoteInput; capturedByUserId: string }) {
  const { input, capturedByUserId } = opts;
  return getRuntime().mutateAndWake(() => db.transaction(tx => {
    if (input.externalId) {
      const existing = tx.query.rawNotes.findFirst({
        where: and(eq(rawNotes.source, input.source), eq(rawNotes.externalId, input.externalId)),
      }).sync();
      if (existing) return { note: hydrateNote(existing), deduped: true };
    }
    const note = tx.insert(rawNotes).values({
      content: "", sourceMeta: null, source: input.source, externalId: input.externalId,
      capturedBy: capturedByUserId, capturedAt: input.capturedAt ? new Date(input.capturedAt) : new Date(),
    }).returning().get();
    writeNotePayload(tx, note.id, input.content, input.sourceMeta);
    tx.insert(processingJobs).values({
      rawNoteId: note.id, generation: crypto.randomUUID(), step: "extract", nextAttempt: Date.now(),
    }).run();
    return { note: { ...note, content: input.content, sourceMeta: input.sourceMeta ?? null }, deduped: false };
  }));
}
export async function markNoteForReprocess(opts: { rawNoteId: string; requestedByUserId?: string }) {
  const note = await getRuntime().mutateAndWake(() => db.transaction(tx => {
    const note = tx.query.rawNotes.findFirst({ where: eq(rawNotes.id, opts.rawNoteId) }).sync();
    if (!note) return null;
    tx.update(rawNotes).set({ processed: false, processedAt: null, processingError: null })
      .where(eq(rawNotes.id, note.id)).run();
    const job = { rawNoteId: note.id, generation: crypto.randomUUID(), step: "extract" as const,
      status: "pending" as const, attempts: 0, nextAttempt: Date.now(), entityIds: [], error: null };
    tx.insert(processingJobs).values(job).onConflictDoUpdate({ target: processingJobs.rawNoteId, set: job }).run();
    for (const link of tx.select().from(entitySources).where(eq(entitySources.rawNoteId, note.id)).all()) {
      tx.insert(entityEvents).values({ entityId: link.entityId, rawNoteId: note.id,
        type: "reprocess", actorUserId: opts.requestedByUserId, body: "Source note queued for reprocessing" }).run();
    }
    return hydrateNote(note);
  }));
  if (note) await tryPublishEvent("raw_note:created", { id: note.id });
  return note;
}
