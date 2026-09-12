import { assertCurrent, finishStep } from "./state.js";
import { hydrateNote } from "../services/note-payload.js";
import { inArray } from "../db/filters.js";
import type { Job, NotesExtractJob } from "./state.js";
import { and, eq } from "drizzle-orm";

import { CONFIDENCE_THRESHOLD } from "@pm/shared";
import { db } from "../db/index.js";
import {
  entities,
  entityEvents,
  entityRelationships,
  entitySources,
  entityTags,
  rawNotes,
  reviewQueue,
  tags,
} from "../db/schema/index.js";
import { createJobLogger } from "../lib/logger.js";
import { extractEntities } from "../ai/extraction.js";
import { tryPublishEvent } from "../services/events.js";

function cleanObject<T extends Record<string, unknown>>(obj: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function getFieldConfidence(entity: any, field: string) {
  const fc = entity?.fieldConfidence?.[field];
  if (!fc || typeof fc.confidence !== "number") return null;
  return fc as { confidence: number; reason?: string };
}

export async function notesExtractProcessor(job: Job<NotesExtractJob>) {
  const log = createJobLogger(job);
  const { rawNoteId } = job.data;

  const storedNote = await db.query.rawNotes.findFirst({
    where: (t, { eq }) => eq(t.id, rawNoteId),
  });
  if (!storedNote) return;
  const note = hydrateNote(storedNote);
  if (note.processed) return;

  try {
    const extraction = await extractEntities({
      rawNoteContent: note.content,
      rawNoteSource: note.source,
      capturedAt: note.capturedAt.toISOString(),
      sourceMeta: (note.sourceMeta ?? undefined) as any,
    });

    const createdEntityIds: string[] = [];
    const createdReviewItems: Array<{ id: string; entityId: string | null; projectId: string | null; reviewType: string; status: string }> = [];
    const permalink = (note.sourceMeta as any)?.permalink as string | undefined;

    await db.transaction((tx) => {
      assertCurrent(tx, job);
      // Clear any prior error before re-attempting.
      tx
        .update(rawNotes)
        .set({ processingError: null })
        .where(eq(rawNotes.id, rawNoteId)).run();

      // Insert entities
      for (const ent of extraction.result.entities) {
        const attributes = cleanObject((ent as any).attributes ?? {});
        const evidence = (ent.evidence ?? []).map((e) => ({
          rawNoteId: note.id,
          quote: e.quote,
          startOffset: e.startOffset,
          endOffset: e.endOffset,
          permalink,
        }));

        const aiMeta = {
          model: extraction.model,
          promptVersion: extraction.promptVersion,
          extractionRunId: String(job.id ?? ""),
          extractedAt: extraction.extractedAt,
          tokenUsage: extraction.tokenUsage,
          fieldConfidence: ent.fieldConfidence,
        };

        const [row] = tx
          .insert(entities)
          .values({
            type: ent.type,
            content: ent.content,
            status: ent.status,
            confidence: ent.confidence,
            attributes: attributes as any,
            aiMeta: aiMeta as any,
            evidence: evidence as any,
          })
          .returning({ id: entities.id }).all();

        createdEntityIds.push(row!.id);

        tx.insert(entitySources).values({
          entityId: row!.id,
          rawNoteId: note.id,
        }).run();

        tx.insert(entityEvents).values({
          entityId: row!.id,
          type: "comment",
          rawNoteId: note.id,
          body: "Extracted from raw note",
          meta: { jobId: String(job.id ?? ""), model: extraction.model, promptVersion: extraction.promptVersion } as any,
        }).run();
      }

      // Relationships (intra-note)
      for (const rel of extraction.result.relationships ?? []) {
        const sourceId = createdEntityIds[rel.sourceIndex];
        const targetId = createdEntityIds[rel.targetIndex];
        if (!sourceId || !targetId) continue;
        tx.insert(entityRelationships).values({
          sourceId,
          targetId,
          relationshipType: rel.relationshipType,
          metadata: { createdBy: "ai", reason: "extracted_in_note" } as any,
        }).run();
      }

      // Tags: upsert tag names and attach to entities.
      const allTagNames = new Set<string>();
      for (const ent of extraction.result.entities) {
        for (const tag of ent.tags ?? []) {
          const name = String(tag).trim().toLowerCase();
          if (name) allTagNames.add(name);
        }
      }

      const tagNames = Array.from(allTagNames);
      if (tagNames.length > 0) {
        // Best-effort insert; ignore conflicts on unique tag name.
        for (const name of tagNames) tx.insert(tags).values({ name }).onConflictDoNothing().run();

        const tagRows = tx
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(inArray(tags.name, tagNames)).all();

        const tagIdByName = new Map(tagRows.map((r) => [r.name, r.id]));

        for (let i = 0; i < extraction.result.entities.length; i++) {
          const ent = extraction.result.entities[i]!;
          const entityId = createdEntityIds[i]!;
          const names = (ent.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
          const values = names
            .map((name) => tagIdByName.get(name))
            .filter(Boolean)
            .map((tagId) => ({ entityId, tagId: tagId as string }));
          if (values.length === 0) continue;
          for (const value of values) tx.insert(entityTags).values(value).onConflictDoNothing().run();
        }
      }

      // Review queue items from low-confidence extraction fields.
      for (let i = 0; i < extraction.result.entities.length; i++) {
        const ent: any = extraction.result.entities[i]!;
        const entityId = createdEntityIds[i]!;

        const fieldConfidence = (ent?.fieldConfidence ?? {}) as Record<string, { confidence: number; reason?: string }>;
        for (const [fieldKey, fc] of Object.entries(fieldConfidence)) {
          if (!fc || typeof fc.confidence !== "number") continue;
          if (fc.confidence >= CONFIDENCE_THRESHOLD) continue;

          if (fieldKey === "type") {
            const [row] = tx
              .insert(reviewQueue)
              .values({
                entityId,
                reviewType: "type_classification",
                status: "pending",
                aiSuggestion: { suggestedType: ent.type, explanation: fc.reason } as any,
                aiConfidence: fc.confidence,
              })
              .onConflictDoNothing()
              .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status }).all();
            if (row) createdReviewItems.push(row);
            continue;
          }

          if (fieldKey === "owner") {
            const owner = ent?.attributes?.owner ?? null;
            if (!owner) continue;
            const [row] = tx
              .insert(reviewQueue)
              .values({
                entityId,
                reviewType: "assignee_suggestion",
                status: "pending",
                aiSuggestion: { suggestedAssigneeName: String(owner), explanation: fc.reason } as any,
                aiConfidence: fc.confidence,
              })
              .onConflictDoNothing()
              .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status }).all();
            if (row) createdReviewItems.push(row);
            continue;
          }

          const suggestedValue =
            fieldKey in ent
              ? (ent as any)[fieldKey]
              : ent?.attributes && fieldKey in (ent.attributes as any)
                ? (ent.attributes as any)[fieldKey]
                : undefined;

          const [row] = tx
            .insert(reviewQueue)
            .values({
              entityId,
              reviewType: "low_confidence",
              status: "pending",
              aiSuggestion: { fieldKey, suggestedValue, explanation: fc.reason } as any,
              aiConfidence: fc.confidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status }).all();
          if (row) createdReviewItems.push(row);
        }

        if (typeof ent.confidence === "number" && ent.confidence < CONFIDENCE_THRESHOLD) {
          const [row] = tx
            .insert(reviewQueue)
            .values({
              entityId,
              reviewType: "low_confidence",
              status: "pending",
              aiSuggestion: { explanation: "Low overall extraction confidence" } as any,
              aiConfidence: ent.confidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status }).all();
          if (row) createdReviewItems.push(row);
        }
      }

      // Mark note processed (even if no entities were extracted).
      tx
        .update(rawNotes)
        .set({ processed: true, processedAt: new Date(), processingError: null })
        .where(eq(rawNotes.id, rawNoteId)).run();
      finishStep(tx, job, createdEntityIds);
    });

    // Emit SSE events after commit.
    await tryPublishEvent("raw_note:processed", { id: rawNoteId });
    for (const id of createdEntityIds) {
      await tryPublishEvent("entity:created", { id, rawNoteId });
    }
    for (const item of createdReviewItems) {
      await tryPublishEvent("review_queue:created", item);
    }


  } catch (err) {
    log.error({ rawNoteId }, "notes:extract failed");
    throw err;
  }
}
