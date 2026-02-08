import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";

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
import { logger } from "../lib/logger.js";
import { extractEntities } from "../ai/extraction.js";
import { DEFAULT_JOB_OPTS, entitiesOrganizeQueue, type NotesExtractJob } from "./queue.js";

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

function isDeterministicZodError(err: unknown) {
  return typeof err === "object" && err !== null && "issues" in err && Array.isArray((err as any).issues);
}

export async function notesExtractProcessor(job: Job<NotesExtractJob>) {
  const { rawNoteId } = job.data;

  const note = await db.query.rawNotes.findFirst({
    where: (t, { eq }) => eq(t.id, rawNoteId),
  });
  if (!note) return;
  if (note.processed) return;

  try {
    const extraction = await extractEntities({
      rawNoteContent: note.content,
      rawNoteSource: note.source,
      capturedAt: note.capturedAt.toISOString(),
      sourceMeta: (note.sourceMeta ?? undefined) as any,
    });

    const createdEntityIds: string[] = [];
    const permalink = (note.sourceMeta as any)?.permalink as string | undefined;

    await db.transaction(async (tx) => {
      // Clear any prior error before re-attempting.
      await tx
        .update(rawNotes)
        .set({ processingError: null })
        .where(eq(rawNotes.id, rawNoteId));

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
          fieldConfidence: ent.fieldConfidence,
        };

        const [row] = await tx
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
          .returning({ id: entities.id });

        createdEntityIds.push(row!.id);

        await tx.insert(entitySources).values({
          entityId: row!.id,
          rawNoteId: note.id,
        });

        await tx.insert(entityEvents).values({
          entityId: row!.id,
          type: "comment",
          rawNoteId: note.id,
          body: "Extracted from raw note",
          meta: { jobId: String(job.id ?? ""), model: extraction.model, promptVersion: extraction.promptVersion } as any,
        });
      }

      // Relationships (intra-note)
      for (const rel of extraction.result.relationships ?? []) {
        const sourceId = createdEntityIds[rel.sourceIndex];
        const targetId = createdEntityIds[rel.targetIndex];
        if (!sourceId || !targetId) continue;
        await tx.insert(entityRelationships).values({
          sourceId,
          targetId,
          relationshipType: rel.relationshipType,
          metadata: { createdBy: "ai", reason: "extracted_in_note" } as any,
        });
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
        await tx.insert(tags).values(tagNames.map((name) => ({ name })) as any).onConflictDoNothing();

        const tagRows = await tx
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(inArray(tags.name, tagNames));

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
          await tx.insert(entityTags).values(values as any).onConflictDoNothing();
        }
      }

      // Review queue items from low-confidence extraction fields.
      for (let i = 0; i < extraction.result.entities.length; i++) {
        const ent: any = extraction.result.entities[i]!;
        const entityId = createdEntityIds[i]!;

        const typeFc = getFieldConfidence(ent, "type");
        if (typeFc && typeFc.confidence < CONFIDENCE_THRESHOLD) {
          await tx
            .insert(reviewQueue)
            .values({
              entityId,
              reviewType: "type_classification",
              status: "pending",
              aiSuggestion: { suggestedType: ent.type, explanation: typeFc.reason } as any,
              aiConfidence: typeFc.confidence,
            })
            .onConflictDoNothing();
        }

        const owner = ent?.attributes?.owner ?? null;
        const ownerFc = getFieldConfidence(ent, "owner");
        if (owner && ownerFc && ownerFc.confidence < CONFIDENCE_THRESHOLD) {
          await tx
            .insert(reviewQueue)
            .values({
              entityId,
              reviewType: "assignee_suggestion",
              status: "pending",
              aiSuggestion: { suggestedAssigneeName: String(owner), explanation: ownerFc.reason } as any,
              aiConfidence: ownerFc.confidence,
            })
            .onConflictDoNothing();
        }

        if (typeof ent.confidence === "number" && ent.confidence < CONFIDENCE_THRESHOLD) {
          await tx
            .insert(reviewQueue)
            .values({
              entityId,
              reviewType: "low_confidence",
              status: "pending",
              aiSuggestion: { explanation: "Low overall extraction confidence" } as any,
              aiConfidence: ent.confidence,
            })
            .onConflictDoNothing();
        }
      }

      // Mark note processed (even if no entities were extracted).
      await tx
        .update(rawNotes)
        .set({ processed: true, processedAt: new Date(), processingError: null })
        .where(eq(rawNotes.id, rawNoteId));
    });

    if (createdEntityIds.length > 0) {
      await entitiesOrganizeQueue.add(
        "entities:organize",
        { rawNoteId, entityIds: createdEntityIds },
        {
          ...DEFAULT_JOB_OPTS,
          jobId: rawNoteId,
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
        }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, rawNoteId, jobId: job.id }, "notes:extract failed");

    await db
      .update(rawNotes)
      .set({ processingError: msg })
      .where(eq(rawNotes.id, rawNoteId));

    if (isDeterministicZodError(err)) {
      // Do not retry deterministic schema mismatches.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (job as any).discard?.();
    }

    throw err;
  }
}

