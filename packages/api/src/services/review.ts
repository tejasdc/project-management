import { and, eq, inArray } from "drizzle-orm";

import type { ReviewSuggestion } from "@pm/shared";
import { ENTITY_STATUSES } from "@pm/shared";
import { db } from "../db/index.js";
import { entities, entityEvents, entityRelationships, epics, projects, reviewQueue } from "../db/schema/index.js";
import { entityWithAttributesSchema } from "../db/validation.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

type ReviewStatus = "accepted" | "rejected" | "modified";

export type ResolveEffects = {
  updatedEntityIds: string[];
  createdEpicId?: string;
  createdProjectId?: string;
  createdRelationshipId?: string;
  autoResolvedReviewIds: string[];
};

function defaultStatusForType(type: "task" | "decision" | "insight") {
  const defaults: Record<string, string> = { task: "captured", decision: "pending", insight: "captured" };
  return defaults[type];
}

function assertValidStatus(type: "task" | "decision" | "insight", status: string) {
  const allowed = (ENTITY_STATUSES as any)[type] as readonly string[] | undefined;
  if (!allowed || !allowed.includes(status)) throw badRequest(`Invalid status for type '${type}'`);
}

function pickSuggestion(opts: { status: ReviewStatus; ai: ReviewSuggestion; user?: ReviewSuggestion | null }) {
  if (opts.status === "accepted") return opts.ai;
  if (opts.status === "modified") return opts.user ?? {};
  return null;
}

async function appendEntityReviewEvent(tx: any, opts: { entityId: string; actorUserId: string; reviewId: string; reviewType: string; body: string; meta?: unknown }) {
  await tx.insert(entityEvents).values({
    entityId: opts.entityId,
    type: "comment",
    actorUserId: opts.actorUserId,
    body: opts.body,
    meta: { reviewId: opts.reviewId, reviewType: opts.reviewType, ...(opts.meta as any) } as any,
  });
}

export async function resolveReviewItem(opts: {
  id: string;
  status: ReviewStatus;
  userResolution?: ReviewSuggestion;
  trainingComment?: string;
  resolvedByUserId: string;
}) {
  return db.transaction(async (tx) => {
    return resolveReviewItemTx(tx, opts);
  });
}

export async function resolveReviewBatch(opts: {
  resolutions: Array<{
    id: string;
    status: ReviewStatus;
    userResolution?: ReviewSuggestion;
    trainingComment?: string;
  }>;
  resolvedByUserId: string;
}) {
  return db.transaction(async (tx) => {
    const items: any[] = [];
    for (const r of opts.resolutions) {
      const res = await resolveReviewItemTx(tx, { ...r, resolvedByUserId: opts.resolvedByUserId });
      items.push(res.item);
    }
    return { items };
  });
}

async function resolveReviewItemTx(
  tx: any,
  opts: {
    id: string;
    status: ReviewStatus;
    userResolution?: ReviewSuggestion;
    trainingComment?: string;
    resolvedByUserId: string;
  }
) {
  const existing = await tx.query.reviewQueue.findFirst({
    where: (t: any, q: any) => and(eq(t.id, opts.id), eq(t.status, "pending")),
  });
  if (!existing) throw notFound("review_queue_item", opts.id);

  const suggestion = pickSuggestion({ status: opts.status, ai: existing.aiSuggestion, user: opts.userResolution });
  const now = new Date();

  const effects: ResolveEffects = {
    updatedEntityIds: [],
    autoResolvedReviewIds: [],
  };

  // Apply effects
  if (existing.reviewType === "type_classification") {
    if (!existing.entityId) throw badRequest("type_classification review item missing entityId");
    if (opts.status !== "rejected") {
      const newType = suggestion?.suggestedType;
      if (!newType) throw badRequest("Missing suggestedType");

      const ent = await tx.query.entities.findFirst({ where: (t: any, q: any) => eq(t.id, existing.entityId) });
      if (!ent) throw notFound("entity", existing.entityId);

      if (ent.type !== newType) {
        const newStatus = defaultStatusForType(newType);
        assertValidStatus(newType, newStatus);

        const attrs = (() => {
          const parsed = entityWithAttributesSchema.safeParse({ type: newType, attributes: ent.attributes ?? {} });
          return parsed.success ? (ent.attributes ?? {}) : {};
        })();

        await tx
          .update(entities)
          .set({ type: newType, status: newStatus, attributes: attrs as any, updatedAt: now })
          .where(eq(entities.id, existing.entityId));

        effects.updatedEntityIds.push(existing.entityId);

        await appendEntityReviewEvent(tx, {
          entityId: existing.entityId,
          actorUserId: opts.resolvedByUserId,
          reviewId: existing.id,
          reviewType: existing.reviewType,
          body: `Type set to '${newType}' (status normalized to '${newStatus}')`,
          meta: { oldType: ent.type, oldStatus: ent.status, newType, newStatus },
        });

        // Auto-reject any other pending review items for this entity.
        // If the entity's type changed, project/epic/assignee/etc suggestions may no longer make sense.
        const others = await tx
          .select({ id: reviewQueue.id })
          .from(reviewQueue)
          .where(
            and(
              eq(reviewQueue.entityId, existing.entityId),
              eq(reviewQueue.status, "pending")
            )
          );

        const otherIds = others.map((r: any) => r.id).filter((id: string) => id && id !== existing.id);
        if (otherIds.length > 0) {
          await tx
            .update(reviewQueue)
            .set({
              status: "rejected",
              resolvedBy: opts.resolvedByUserId,
              resolvedAt: now,
              userResolution: { explanation: "Auto-rejected due to entity type change" } as any,
              updatedAt: now,
            })
            .where(and(inArray(reviewQueue.id, otherIds), eq(reviewQueue.status, "pending")));
          effects.autoResolvedReviewIds.push(...otherIds);
        }
      }
    }
  }

  if (existing.reviewType === "project_assignment") {
    if (!existing.entityId) throw badRequest("project_assignment review item missing entityId");
    const projectId = opts.status === "rejected" ? null : (suggestion?.suggestedProjectId ?? null);
    await tx.update(entities).set({ projectId, updatedAt: now }).where(eq(entities.id, existing.entityId));
    effects.updatedEntityIds.push(existing.entityId);
    await appendEntityReviewEvent(tx, {
      entityId: existing.entityId,
      actorUserId: opts.resolvedByUserId,
      reviewId: existing.id,
      reviewType: existing.reviewType,
      body: projectId ? `Project assigned` : `Project cleared`,
      meta: { projectId, resolutionStatus: opts.status },
    });
  }

  if (existing.reviewType === "epic_assignment") {
    if (!existing.entityId) throw badRequest("epic_assignment review item missing entityId");
    const epicId = opts.status === "rejected" ? null : (suggestion?.suggestedEpicId ?? null);
    await tx.update(entities).set({ epicId, updatedAt: now }).where(eq(entities.id, existing.entityId));
    effects.updatedEntityIds.push(existing.entityId);
    await appendEntityReviewEvent(tx, {
      entityId: existing.entityId,
      actorUserId: opts.resolvedByUserId,
      reviewId: existing.id,
      reviewType: existing.reviewType,
      body: epicId ? `Epic assigned` : `Epic cleared`,
      meta: { epicId, resolutionStatus: opts.status },
    });
  }

  if (existing.reviewType === "assignee_suggestion") {
    if (!existing.entityId) throw badRequest("assignee_suggestion review item missing entityId");
    const assigneeId = opts.status === "rejected" ? null : (suggestion?.suggestedAssigneeId ?? null);
    await tx.update(entities).set({ assigneeId, updatedAt: now }).where(eq(entities.id, existing.entityId));
    effects.updatedEntityIds.push(existing.entityId);
    await appendEntityReviewEvent(tx, {
      entityId: existing.entityId,
      actorUserId: opts.resolvedByUserId,
      reviewId: existing.id,
      reviewType: existing.reviewType,
      body: assigneeId ? `Assignee set` : `Assignee cleared`,
      meta: { assigneeId, resolutionStatus: opts.status },
    });
  }

  if (existing.reviewType === "duplicate_detection") {
    if (!existing.entityId) throw badRequest("duplicate_detection review item missing entityId");
    if (opts.status !== "rejected") {
      const duplicateEntityId = suggestion?.duplicateEntityId;
      if (!duplicateEntityId) throw badRequest("Missing duplicateEntityId");

      const [edge] = await tx
        .insert(entityRelationships)
        .values({
          sourceId: existing.entityId,
          targetId: duplicateEntityId,
          relationshipType: "duplicate_of",
          metadata: { createdBy: "user", reason: suggestion?.explanation, confidence: suggestion?.similarityScore } as any,
        })
        .returning({ id: entityRelationships.id });

      effects.createdRelationshipId = edge?.id;

      await appendEntityReviewEvent(tx, {
        entityId: existing.entityId,
        actorUserId: opts.resolvedByUserId,
        reviewId: existing.id,
        reviewType: existing.reviewType,
        body: `Marked as duplicate of ${duplicateEntityId}`,
        meta: { duplicateEntityId, similarityScore: suggestion?.similarityScore },
      });
    }
  }

  if (existing.reviewType === "epic_creation") {
    if (!existing.projectId) throw badRequest("epic_creation review item missing projectId");
    if (opts.status !== "rejected") {
      const name = suggestion?.proposedEpicName;
      const description = suggestion?.proposedEpicDescription ?? null;
      const projectId = suggestion?.proposedEpicProjectId ?? existing.projectId;
      if (!name) throw badRequest("Missing proposedEpicName");

      const [epic] = await tx
        .insert(epics)
        .values({
          projectId,
          name,
          description,
          createdBy: "ai_suggestion",
        } as any)
        .returning({ id: epics.id });

      effects.createdEpicId = epic?.id;

      // Create follow-up epic_assignment review items for candidate entities (if provided).
      const candidateEntityIds = (suggestion as any)?.candidateEntityIds as unknown;
      if (epic?.id && Array.isArray(candidateEntityIds) && candidateEntityIds.length > 0) {
        const uniqueIds = Array.from(new Set(candidateEntityIds)).filter((id) => typeof id === "string" && id.length > 0);
        for (const entityId of uniqueIds) {
          // Defensive: only create if the entity exists.
          const ent = await tx.query.entities.findFirst({ where: (t: any, q: any) => eq(t.id, entityId) });
          if (!ent) continue;

          await tx
            .insert(reviewQueue)
            .values({
              entityId,
              projectId,
              reviewType: "epic_assignment",
              status: "pending",
              aiSuggestion: { suggestedEpicId: epic.id, explanation: `Assign to newly created epic '${name}'` } as any,
              aiConfidence: existing.aiConfidence,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  if (existing.reviewType === "project_creation") {
    if (opts.status !== "rejected") {
      const name = suggestion?.proposedProjectName;
      const description = suggestion?.proposedProjectDescription ?? null;
      if (!name) throw badRequest("Missing proposedProjectName");

      const [project] = await tx
        .insert(projects)
        .values({ name, description })
        .returning({ id: projects.id });

      effects.createdProjectId = project?.id;

      // Create follow-up project_assignment review items for candidate entities
      const candidateEntityIds = (suggestion as any)?.candidateEntityIds as unknown;
      if (project?.id && Array.isArray(candidateEntityIds) && candidateEntityIds.length > 0) {
        const uniqueIds = Array.from(new Set(candidateEntityIds))
          .filter((id) => typeof id === "string" && id.length > 0);
        for (const entityId of uniqueIds) {
          const ent = await tx.query.entities.findFirst({
            where: (t: any, q: any) => eq(t.id, entityId),
          });
          if (!ent) continue;

          // Remove any stale pending project_assignment for this entity
          await tx.delete(reviewQueue).where(
            and(eq(reviewQueue.entityId, entityId), eq(reviewQueue.reviewType, "project_assignment"), eq(reviewQueue.status, "pending"))
          );

          await tx
            .insert(reviewQueue)
            .values({
              entityId,
              projectId: project.id,
              reviewType: "project_assignment",
              status: "pending",
              aiSuggestion: {
                suggestedProjectId: project.id,
                explanation: `Assign to newly created project '${name}'`,
              } as any,
              aiConfidence: existing.aiConfidence,
            })
            .onConflictDoNothing();
        }
      }
    }
  }

  // Update the review item itself
  const [item] = await tx
    .update(reviewQueue)
    .set({
      status: opts.status,
      resolvedBy: opts.resolvedByUserId,
      resolvedAt: now,
      trainingComment: opts.trainingComment ?? null,
      userResolution: opts.status === "modified" ? (opts.userResolution as any) : null,
      updatedAt: now,
    })
    .where(and(eq(reviewQueue.id, opts.id), eq(reviewQueue.status, "pending")))
    .returning();

  if (!item) throw conflict("Review item is no longer pending");

  return { item, effects };
}
