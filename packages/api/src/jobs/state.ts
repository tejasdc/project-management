import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { processingJobs } from "../db/schema/index.js";

export type NotesExtractJob = { rawNoteId: string };
export type EntitiesOrganizeJob = { rawNoteId: string; entityIds: string[] };
export type Job<T> = { id: string; name: string; generation: string; data: T };
export class SupersededJob extends Error {}
export function assertCurrent(tx: Pick<typeof db, "query">, job: Job<NotesExtractJob>) {
  const current = tx.query.processingJobs.findFirst({ where: and(
    eq(processingJobs.rawNoteId, job.data.rawNoteId), eq(processingJobs.generation, job.generation),
    eq(processingJobs.status, "pending"), eq(processingJobs.step, job.name === "notes-extract" ? "extract" : "organize"),
  ) }).sync();
  if (!current) throw new SupersededJob("Processing generation no longer current");
}
export function finishStep(tx: Pick<typeof db, "update">, job: Job<NotesExtractJob>, entityIds?: string[]) {
  const next = entityIds?.length ? "organize" as const : undefined;
  tx.update(processingJobs).set({
    ...(next ? { step: next, entityIds } : {}),
    status: next ? "pending" : "done", attempts: 0, nextAttempt: Date.now(), error: null,
  }).where(and(eq(processingJobs.rawNoteId, job.data.rawNoteId), eq(processingJobs.generation, job.generation))).run();
}
