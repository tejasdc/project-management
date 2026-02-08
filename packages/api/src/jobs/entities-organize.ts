import type { Job } from "bullmq";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { CONFIDENCE_THRESHOLD } from "@pm/shared";
import { db } from "../db/index.js";
import { entities, entityTags, epics, projects, rawNotes, reviewQueue, tags, users } from "../db/schema/index.js";
import { createJobLogger } from "../lib/logger.js";
import { organizeEntities } from "../ai/organization.js";
import { tryPublishEvent } from "../services/events.js";
import { DEFAULT_JOB_OPTS, type EntitiesOrganizeJob } from "./queue.js";

function maxBy<T>(items: T[], score: (t: T) => number) {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

export async function entitiesOrganizeProcessor(job: Job<EntitiesOrganizeJob>) {
  const log = createJobLogger(job);
  const { rawNoteId, entityIds } = job.data;
  if (!entityIds || entityIds.length === 0) return;

  const note = await db.query.rawNotes.findFirst({ where: (t, { eq }) => eq(t.id, rawNoteId) });
  if (!note) return;

  const entityRows = await db
    .select()
    .from(entities)
    .where(inArray(entities.id, entityIds));

  const entityById = new Map(entityRows.map((e) => [e.id, e]));
  const orderedEntities = entityIds.map((id) => entityById.get(id)).filter(Boolean) as typeof entityRows;

  // Tags for these entities
  const tagRows = await db
    .select({ entityId: entityTags.entityId, tagName: tags.name })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(inArray(entityTags.entityId, entityIds));

  const tagNamesByEntityId = new Map<string, string[]>();
  for (const r of tagRows) {
    const arr = tagNamesByEntityId.get(r.entityId) ?? [];
    arr.push(r.tagName);
    tagNamesByEntityId.set(r.entityId, arr);
  }

  const extractedEntities = orderedEntities.map((e) => ({
    type: e.type,
    content: e.content,
    status: e.status,
    attributes: e.attributes ?? {},
    tags: tagNamesByEntityId.get(e.id) ?? [],
    evidence: e.evidence ?? [],
  }));

  // Active projects + epics
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.status, "active"), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt), desc(projects.createdAt));

  const projectIds = projectRows.map((p) => p.id);
  const epicRows = projectIds.length
    ? await db
        .select()
        .from(epics)
        .where(and(inArray(epics.projectId, projectIds), isNull(epics.deletedAt)))
        .orderBy(desc(epics.updatedAt), desc(epics.createdAt))
    : [];

  const epicsByProjectId = new Map<string, typeof epicRows>();
  for (const e of epicRows) {
    const arr = epicsByProjectId.get(e.projectId) ?? [];
    arr.push(e);
    epicsByProjectId.set(e.projectId, arr);
  }

  const projectsContext = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    epics: (epicsByProjectId.get(p.id) ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description ?? null,
    })),
  }));

  // Recent entities sample (for duplicate context)
  const recentEntityRows = await db
    .select()
    .from(entities)
    .where(and(isNull(entities.deletedAt)))
    .orderBy(desc(entities.createdAt), desc(entities.id))
    .limit(120);

  const recentIds = recentEntityRows.map((e) => e.id);
  const recentTags = recentIds.length
    ? await db
        .select({ entityId: entityTags.entityId, tagName: tags.name })
        .from(entityTags)
        .innerJoin(tags, eq(tags.id, entityTags.tagId))
        .where(inArray(entityTags.entityId, recentIds))
    : [];

  const recentTagNamesById = new Map<string, string[]>();
  for (const r of recentTags) {
    const arr = recentTagNamesById.get(r.entityId) ?? [];
    arr.push(r.tagName);
    recentTagNamesById.set(r.entityId, arr);
  }

  const recentEntities = recentEntityRows.map((e) => ({
    id: e.id,
    type: e.type,
    content: e.content,
    tags: recentTagNamesById.get(e.id) ?? [],
    projectId: e.projectId ?? null,
  }));

  // Known users for assignee resolution
  const knownUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);

  try {
    const org = await organizeEntities({
      extractedEntities,
      projects: projectsContext,
      recentEntities,
      knownUsers,
      rawNoteSource: note.source,
      sourceMeta: (note.sourceMeta ?? undefined) as any,
    });

    const updatedEntityIds: string[] = [];
    const updatedProjectIds = new Set<string>();
    const createdReviewItems: Array<{ id: string; entityId: string | null; projectId: string | null; reviewType: string; status: string }> = [];

    await db.transaction(async (tx) => {
      for (const o of org.result.entityOrganizations) {
        const entityId = entityIds[o.entityIndex];
        if (!entityId) continue;

        const existing = await tx.query.entities.findFirst({ where: (t, { eq }) => eq(t.id, entityId) });
        if (!existing) continue;

        // Project assignment
        if (o.projectId && o.projectConfidence >= CONFIDENCE_THRESHOLD) {
          if (existing.projectId !== o.projectId) {
            await tx.update(entities).set({ projectId: o.projectId, updatedAt: new Date() }).where(eq(entities.id, entityId));
            updatedEntityIds.push(entityId);
            if (existing.projectId) updatedProjectIds.add(existing.projectId);
            updatedProjectIds.add(o.projectId);
          }
        } else {
          const [row] = await tx
            .insert(reviewQueue)
            .values({
              entityId,
              projectId: o.projectId ?? existing.projectId ?? null,
              reviewType: "project_assignment",
              status: "pending",
              aiSuggestion: { suggestedProjectId: o.projectId ?? undefined, explanation: o.projectReason } as any,
              aiConfidence: o.projectConfidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
          if (row) createdReviewItems.push(row);
        }

        // Epic assignment
        if (o.epicId && o.epicConfidence >= CONFIDENCE_THRESHOLD) {
          if (existing.epicId !== o.epicId) {
            await tx.update(entities).set({ epicId: o.epicId, updatedAt: new Date() }).where(eq(entities.id, entityId));
            updatedEntityIds.push(entityId);
          }
        } else {
          const [row] = await tx
            .insert(reviewQueue)
            .values({
              entityId,
              projectId: existing.projectId ?? o.projectId ?? null,
              reviewType: "epic_assignment",
              status: "pending",
              aiSuggestion: { suggestedEpicId: o.epicId ?? undefined, explanation: o.epicReason } as any,
              aiConfidence: o.epicConfidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
          if (row) createdReviewItems.push(row);
        }

        // Assignee
        if (o.assigneeConfidence !== null) {
          if (o.assigneeId && o.assigneeConfidence >= CONFIDENCE_THRESHOLD) {
            if (existing.assigneeId !== o.assigneeId) {
              await tx.update(entities).set({ assigneeId: o.assigneeId, updatedAt: new Date() }).where(eq(entities.id, entityId));
              updatedEntityIds.push(entityId);
            }
          } else {
            const [row] = await tx
              .insert(reviewQueue)
              .values({
                entityId,
                projectId: existing.projectId ?? o.projectId ?? null,
                reviewType: "assignee_suggestion",
                status: "pending",
                aiSuggestion: { suggestedAssigneeId: o.assigneeId ?? undefined, explanation: o.assigneeReason ?? undefined } as any,
                aiConfidence: o.assigneeConfidence ?? 0,
              })
              .onConflictDoNothing()
              .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
            if (row) createdReviewItems.push(row);
          }
        }

        // Duplicates (top candidate only)
        if (o.duplicateCandidates && o.duplicateCandidates.length > 0) {
          const best = maxBy(o.duplicateCandidates, (d) => d.similarityScore);
          if (best) {
            const [row] = await tx
              .insert(reviewQueue)
              .values({
                entityId,
                projectId: existing.projectId ?? o.projectId ?? null,
                reviewType: "duplicate_detection",
                status: "pending",
                aiSuggestion: {
                  duplicateCandidates: o.duplicateCandidates,
                  duplicateEntityId: best.entityId,
                  similarityScore: best.similarityScore,
                  explanation: best.reason,
                } as any,
                aiConfidence: best.similarityScore,
              })
              .onConflictDoNothing()
              .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
            if (row) createdReviewItems.push(row);
          }
        }
      }

      // Epic creation suggestions are project-scoped review items.
      for (const s of org.result.epicSuggestions) {
        const candidateEntityIds = (s.entityIndices ?? [])
          .map((idx) => entityIds[idx])
          .filter(Boolean);

        const [row] = await tx
          .insert(reviewQueue)
          .values({
            projectId: s.projectId,
            reviewType: "epic_creation",
            status: "pending",
            aiSuggestion: {
              proposedEpicName: s.name,
              proposedEpicDescription: s.description,
              proposedEpicProjectId: s.projectId,
              candidateEntityIds,
              explanation: s.reason,
            } as any,
            aiConfidence: (s as any).confidence ?? 0.85,
          })
          .onConflictDoNothing()
          .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
        if (row) createdReviewItems.push(row);
      }
    });

    // Emit SSE events after commit.
    for (const id of Array.from(new Set(updatedEntityIds))) {
      await tryPublishEvent("entity:updated", { id, rawNoteId });
    }
    for (const item of createdReviewItems) {
      await tryPublishEvent("review_queue:created", item);
    }
    for (const projectId of Array.from(updatedProjectIds)) {
      await tryPublishEvent("project:stats_updated", { projectId });
    }
  } catch (err) {
    log.error({ err, rawNoteId }, "entities:organize failed");
    throw err;
  }
}
