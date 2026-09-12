import { getRuntime } from "../runtime.js";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { processingJobs, rawNotes } from "../db/schema/index.js";
import { notesExtractProcessor } from "./notes-extract.js";
import { entitiesOrganizeProcessor } from "./entities-organize.js";
import { SupersededJob } from "./state.js";
import { tryPublishEvent } from "../services/events.js";

export function nextJobTime() {
  return db.select({ time: processingJobs.nextAttempt }).from(processingJobs)
    .where(eq(processingJobs.status, "pending")).orderBy(asc(processingJobs.nextAttempt)).get()?.time;
}
export async function runDueJob() {
  const row = db.select().from(processingJobs).where(and(
    eq(processingJobs.status, "pending"), lte(processingJobs.nextAttempt, Date.now()),
  )).orderBy(asc(processingJobs.nextAttempt)).get();
  if (!row) return;
  const active = and(eq(processingJobs.rawNoteId, row.rawNoteId), eq(processingJobs.generation, row.generation),
    eq(processingJobs.step, row.step), eq(processingJobs.status, "pending"));
  const attempt = row.attempts + 1;
  if (attempt > 5) {
    db.transaction(tx => {
      tx.update(processingJobs).set({ status: "failed", error: "Processing interrupted repeatedly. Reprocess to retry." }).where(active).run();
      tx.update(rawNotes).set({ processingError: "Processing interrupted repeatedly. Reprocess to retry." }).where(eq(rawNotes.id, row.rawNoteId)).run();
    });
    await tryPublishEvent("raw_note:processed", { id: row.rawNoteId });
    return;
  }
  await getRuntime().mutateAndWake(() => db.update(processingJobs).set({ attempts: attempt }).where(active).run());
  const job = { id: row.generation, generation: row.generation,
    name: row.step === "extract" ? "notes-extract" : "entities-organize", data: { rawNoteId: row.rawNoteId, entityIds: row.entityIds } };
  try {
    if (row.step === "extract") await notesExtractProcessor(job);
    else await entitiesOrganizeProcessor(job);
  } catch (error) {
    if (error instanceof SupersededJob) return;
    // Do not persist SDK messages: they can echo private inputs, headers and keys.
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
    const invalidOutput = typeof error === "object" && error !== null && "issues" in error;
    const permanent = invalidOutput || (status !== undefined && status >= 400 && status < 500 && status !== 429);
    const failed = permanent || attempt >= 5;
    const message = invalidOutput ? "AI output did not match the extraction schema. Reprocess to retry."
      : status === 401 || status === 403 ? "AI credentials need attention."
      : status === 400 || status === 413 ? "The AI provider could not process this note. Check its size and retry."
      : failed ? "AI processing failed after retries. Reprocess to retry." : "AI processing interrupted; retry scheduled.";
    db.transaction(tx => {
      const current = tx.select().from(processingJobs).where(active).get();
      if (!current) return;
      tx.update(processingJobs).set({ status: failed ? "failed" : "pending",
        nextAttempt: Date.now() + 2000 * 2 ** (attempt - 1), error: message }).where(active).run();
      tx.update(rawNotes).set({ processingError: message }).where(eq(rawNotes.id, row.rawNoteId)).run();
    });
    await tryPublishEvent("raw_note:processed", { id: row.rawNoteId });
  }
}
