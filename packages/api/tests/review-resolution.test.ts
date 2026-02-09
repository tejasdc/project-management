import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "../src/db/index.js";
import { entities, epics, reviewQueue } from "../src/db/schema/index.js";
import { resolveReviewItem } from "../src/services/review.js";
import { createPendingReviewItem, createTestEntity, createTestProject, createTestUser } from "./factories.js";

// Mock the queue module so ioredis never tries to connect to Redis.
vi.mock("../src/jobs/queue.js", () => ({
  getNotesExtractQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getNotesReprocessQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesOrganizeQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesComputeEmbeddingsQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getReviewQueueExportTrainingDataQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  DEFAULT_JOB_OPTS: { removeOnComplete: true, removeOnFail: 500 },
  isRedisConfigured: () => false,
  getRedisConnection: () => null,
  getRedisConnectionOrThrow: () => { throw new Error("Redis not available in tests"); },
}));

// Mock SSE events to prevent ioredis connections from the event publisher.
vi.mock("../src/services/events.js", () => ({
  tryPublishEvent: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(() => {}),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

describe("review resolution semantics", () => {
  it("type_classification change auto-rejects all other pending review items for the entity", async () => {
    const actor = await createTestUser();
    const ent = await createTestEntity({ type: "task", status: "captured" } as any);

    const typeItem = await createPendingReviewItem({
      entityId: ent.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision" } as any,
      aiConfidence: 0.5,
    });

    const other1 = await createPendingReviewItem({
      entityId: ent.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: null } as any,
      aiConfidence: 0.4,
    });
    const other2 = await createPendingReviewItem({
      entityId: ent.id,
      reviewType: "epic_assignment" as any,
      aiSuggestion: { suggestedEpicId: null } as any,
      aiConfidence: 0.4,
    });
    const other3 = await createPendingReviewItem({
      entityId: ent.id,
      reviewType: "assignee_suggestion" as any,
      aiSuggestion: { suggestedAssigneeId: null } as any,
      aiConfidence: 0.4,
    });

    await resolveReviewItem({
      id: typeItem.id,
      status: "accepted",
      resolvedByUserId: actor.id,
    });

    const entAfter = await db.query.entities.findFirst({ where: (t, q) => q.eq(t.id, ent.id) });
    expect(entAfter?.type).toBe("decision");
    expect(entAfter?.status).toBe("pending");

    const rows = await db
      .select()
      .from(reviewQueue)
      .where(and(eq(reviewQueue.entityId, ent.id), eq(reviewQueue.status, "rejected")));

    const rejectedIds = new Set(rows.map((r) => r.id));
    expect(rejectedIds.has(other1.id)).toBe(true);
    expect(rejectedIds.has(other2.id)).toBe(true);
    expect(rejectedIds.has(other3.id)).toBe(true);
  });

  it("rejected project_assignment clears entities.project_id", async () => {
    const actor = await createTestUser();
    const project = await createTestProject();
    const ent = await createTestEntity({ projectId: project.id } as any);

    const item = await createPendingReviewItem({
      entityId: ent.id,
      projectId: project.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project.id } as any,
      aiConfidence: 0.5,
    });

    await resolveReviewItem({
      id: item.id,
      status: "rejected",
      resolvedByUserId: actor.id,
    });

    const entAfter = await db.query.entities.findFirst({ where: (t, q) => q.eq(t.id, ent.id) });
    expect(entAfter?.projectId).toBe(null);
  });

  it("epic_creation accepted creates follow-up epic_assignment review items for candidates", async () => {
    const actor = await createTestUser();
    const project = await createTestProject();
    const candidate = await createTestEntity({ projectId: project.id } as any);

    const item = await createPendingReviewItem({
      projectId: project.id,
      reviewType: "epic_creation" as any,
      aiSuggestion: {
        proposedEpicName: "New Epic",
        proposedEpicDescription: "desc",
        proposedEpicProjectId: project.id,
        candidateEntityIds: [candidate.id],
      } as any,
      aiConfidence: 0.8,
    });

    const res = await resolveReviewItem({
      id: item.id,
      status: "accepted",
      resolvedByUserId: actor.id,
    });

    expect(res.effects.createdEpicId).toBeTruthy();
    const createdEpic = await db.query.epics.findFirst({ where: (t, q) => q.eq(t.id, res.effects.createdEpicId!) });
    expect(createdEpic).toBeTruthy();

    const followUp = await db.query.reviewQueue.findFirst({
      where: (t, q) => and(eq(t.entityId, candidate.id), eq(t.reviewType, "epic_assignment"), eq(t.status, "pending")),
    });
    expect(followUp).toBeTruthy();
    expect((followUp as any).aiSuggestion?.suggestedEpicId).toBe(res.effects.createdEpicId);
  });
});

