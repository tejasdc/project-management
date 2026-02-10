import type { Job } from "bullmq";
import { and, desc, eq, ilike, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { CONFIDENCE_THRESHOLD } from "@pm/shared";
import { db } from "../db/index.js";
import { entities, entityRelationships, entityTags, epics, projects, rawNotes, reviewQueue, tags, users } from "../db/schema/index.js";
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

  // Recent entities sample (for duplicate context).
  // Exclude the current batch to prevent the AI from comparing entities to themselves.
  const recentEntityRows = await db
    .select()
    .from(entities)
    .where(
      and(
        isNull(entities.deletedAt),
        entityIds.length > 0 ? notInArray(entities.id, entityIds) : undefined,
      )
    )
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
    const createdProjects: Array<{ id: string; name: string }> = [];
    const createdEpics: Array<{ id: string; projectId: string; name: string }> = [];

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
        } else if (o.projectId !== null || o.projectConfidence !== 0) {
          // Skip review items where the AI has no suggestion and zero confidence — these are
          // "no match" signals that just clog the review queue.
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
        } else if (o.epicId !== null || o.epicConfidence !== 0) {
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
          } else if (o.assigneeId !== null || (o.assigneeConfidence !== 0 && o.assigneeConfidence !== null)) {
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
            if (best.similarityScore >= CONFIDENCE_THRESHOLD) {
              // Auto-apply: create duplicate_of relationship directly
              await tx
                .insert(entityRelationships)
                .values({
                  sourceId: entityId,
                  targetId: best.entityId,
                  relationshipType: "duplicate_of",
                  metadata: { createdBy: "ai", reason: best.reason, confidence: best.similarityScore } as any,
                })
                .onConflictDoNothing();
              updatedEntityIds.push(entityId);
            } else {
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
      }

      // Epic creation suggestions — auto-create if confident, otherwise review.
      for (const s of org.result.epicSuggestions) {
        const candidateEntityIds = (s.entityIndices ?? [])
          .map((idx) => entityIds[idx])
          .filter(Boolean);

        const epicConfidence = s.confidence ?? 0.85;

        if (epicConfidence >= CONFIDENCE_THRESHOLD && s.projectId && candidateEntityIds.length > 0) {
          // Auto-create epic and assign candidate entities directly
          const [newEpic] = await tx
            .insert(epics)
            .values({
              projectId: s.projectId,
              name: s.name,
              description: s.description,
              createdBy: "ai_suggestion",
            } as any)
            .returning({ id: epics.id });

          if (newEpic?.id) {
            createdEpics.push({ id: newEpic.id, projectId: s.projectId, name: s.name });
            for (const eid of candidateEntityIds) {
              await tx
                .update(entities)
                .set({ epicId: newEpic.id, projectId: s.projectId, updatedAt: new Date() })
                .where(eq(entities.id, eid));
              updatedEntityIds.push(eid);
            }
          }

          log.info({ epicId: newEpic?.id, name: s.name, confidence: epicConfidence }, "auto-created epic");
        } else {
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
              aiConfidence: epicConfidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
          if (row) createdReviewItems.push(row);
        }
      }

      // Project creation suggestions — auto-create if confident, otherwise review.
      for (const s of org.result.projectSuggestions) {
        const candidateEntityIds = (s.entityIndices ?? [])
          .map((idx) => entityIds[idx])
          .filter(Boolean);

        const projectConfidence = s.confidence ?? 0.85;

        // Deduplicate: skip if a project with this name already exists (case-insensitive exact match)
        const existingProject = await tx.query.projects.findFirst({
          where: (t, { and, isNull }) => and(
            sql`lower(${t.name}) = lower(${s.name})`,
            isNull(t.deletedAt),
          ),
        });
        if (existingProject) continue;

        // Skip auto-create if no candidate entities — don't create orphan projects
        if (projectConfidence >= CONFIDENCE_THRESHOLD && candidateEntityIds.length > 0) {
          // Auto-create project and assign candidate entities directly
          const [newProject] = await tx
            .insert(projects)
            .values({ name: s.name, description: s.description })
            .returning({ id: projects.id });

          if (newProject?.id) {
            createdProjects.push({ id: newProject.id, name: s.name });
            for (const eid of candidateEntityIds) {
              await tx
                .update(entities)
                .set({ projectId: newProject.id, updatedAt: new Date() })
                .where(eq(entities.id, eid));
              updatedEntityIds.push(eid);
              updatedProjectIds.add(newProject.id);
            }
          }

          log.info({ projectId: newProject?.id, name: s.name, confidence: projectConfidence }, "auto-created project");
        } else {
          // Use the first candidate entity to satisfy the entity_or_project CHECK constraint
          const anchorEntityId = candidateEntityIds[0] ?? null;
          if (!anchorEntityId) continue;

          // Deduplicate: skip if a pending project_creation review item already proposes this name
          const existingReview = await tx
            .select({ id: reviewQueue.id })
            .from(reviewQueue)
            .where(
              and(
                eq(reviewQueue.reviewType, "project_creation"),
                eq(reviewQueue.status, "pending"),
                sql`${reviewQueue.aiSuggestion}->>'proposedProjectName' ILIKE ${s.name}`,
              )
            )
            .limit(1);
          if (existingReview.length > 0) continue;

          const [row] = await tx
            .insert(reviewQueue)
            .values({
              entityId: anchorEntityId,
              reviewType: "project_creation",
              status: "pending",
              aiSuggestion: {
                proposedProjectName: s.name,
                proposedProjectDescription: s.description,
                candidateEntityIds,
                explanation: s.reason,
              } as any,
              aiConfidence: projectConfidence,
            })
            .onConflictDoNothing()
            .returning({ id: reviewQueue.id, entityId: reviewQueue.entityId, projectId: reviewQueue.projectId, reviewType: reviewQueue.reviewType, status: reviewQueue.status });
          if (row) createdReviewItems.push(row);
        }
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
    for (const p of createdProjects) {
      await tryPublishEvent("project:created", { id: p.id, name: p.name });
    }
    for (const e of createdEpics) {
      await tryPublishEvent("epic:created", { id: e.id, projectId: e.projectId, name: e.name });
    }
  } catch (err) {
    log.error({ err, rawNoteId }, "entities:organize failed");
    throw err;
  }
}
