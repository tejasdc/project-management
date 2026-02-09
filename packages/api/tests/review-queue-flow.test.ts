import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { db } from "../src/db/index.js";
import { entities } from "../src/db/schema/index.js";
import {
  createPendingReviewItem,
  createTestApiKey,
  createTestEntity,
  createTestProject,
  createTestUser,
} from "./factories.js";
import { authedRequest } from "./helpers.js";

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

describe("review queue flow", () => {
  async function setup() {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    return { user, apiKey: plaintextKey, app };
  }

  // ----------------------------------------------------------------
  // Listing and counting
  // ----------------------------------------------------------------

  it("lists pending review items", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Ambiguous task", status: "captured" } as any);

    await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision", explanation: "Sounds like a decision" } as any,
      aiConfidence: 0.45,
    });
    await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: null, explanation: "No clear project" } as any,
      aiConfidence: 0.3,
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/review-queue?status=pending",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items.every((item: any) => item.status === "pending")).toBe(true);
  });

  it("filters review queue by reviewType", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity();
    await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "insight" } as any,
      aiConfidence: 0.5,
    });

    const project = await createTestProject();
    await createPendingReviewItem({
      projectId: project.id,
      reviewType: "epic_creation" as any,
      aiSuggestion: { proposedEpicName: "New Epic", proposedEpicProjectId: project.id } as any,
      aiConfidence: 0.7,
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/review-queue?reviewType=type_classification",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.every((item: any) => item.reviewType === "type_classification")).toBe(true);
  });

  it("filters review queue by projectId", async () => {
    const { app, apiKey } = await setup();

    const project1 = await createTestProject({ name: "Project Alpha" });
    const project2 = await createTestProject({ name: "Project Beta" });

    const entity1 = await createTestEntity({ projectId: project1.id } as any);
    const entity2 = await createTestEntity({ projectId: project2.id } as any);

    await createPendingReviewItem({
      entityId: entity1.id,
      projectId: project1.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project1.id } as any,
      aiConfidence: 0.6,
    });
    await createPendingReviewItem({
      entityId: entity2.id,
      projectId: project2.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project2.id } as any,
      aiConfidence: 0.6,
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/review-queue?projectId=${project1.id}`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.every((item: any) => item.projectId === project1.id)).toBe(true);
  });

  it("returns review count with filters", async () => {
    const { app, apiKey } = await setup();

    const entity1 = await createTestEntity();
    const entity2 = await createTestEntity();
    const entity3 = await createTestEntity();

    await createPendingReviewItem({
      entityId: entity1.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision" } as any,
      aiConfidence: 0.5,
    });
    await createPendingReviewItem({
      entityId: entity2.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "insight" } as any,
      aiConfidence: 0.4,
    });
    await createPendingReviewItem({
      entityId: entity3.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: null } as any,
      aiConfidence: 0.3,
    });

    // Total pending count
    const totalRes = await authedRequest(app, {
      method: "GET",
      path: "/api/review-queue/count?status=pending",
      apiKey,
    });
    expect(totalRes.status).toBe(200);
    const totalBody = (await totalRes.json()) as any;
    expect(totalBody.count).toBe(3);

    // Count by type
    const typeRes = await authedRequest(app, {
      method: "GET",
      path: "/api/review-queue/count?status=pending&reviewType=type_classification",
      apiKey,
    });
    expect(typeRes.status).toBe(200);
    const typeBody = (await typeRes.json()) as any;
    expect(typeBody.count).toBe(2);
  });

  // ----------------------------------------------------------------
  // Accepting review items
  // ----------------------------------------------------------------

  it("accepts a type_classification review and updates entity type", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Should we use React or Vue?", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision", explanation: "This is clearly a decision about framework choice" } as any,
      aiConfidence: 0.55,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.item.status).toBe("accepted");

    // Verify the entity was updated
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.type).toBe("decision");
    expect(entityBody.entity.status).toBe("pending"); // decision default status
  });

  it("accepts a project_assignment review and assigns entity to project", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Target Project" });
    const entity = await createTestEntity({ type: "task", content: "Setup CI", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      projectId: project.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project.id, explanation: "Matches project scope" } as any,
      aiConfidence: 0.7,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(200);

    // Verify entity now has the project
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.projectId).toBe(project.id);
  });

  it("accepts an epic_creation review and creates a new epic with follow-up assignments", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Epic Host Project" });
    const candidate1 = await createTestEntity({ projectId: project.id, type: "task", content: "Stripe setup", status: "captured" } as any);
    const candidate2 = await createTestEntity({ projectId: project.id, type: "task", content: "Invoice generation", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      projectId: project.id,
      reviewType: "epic_creation" as any,
      aiSuggestion: {
        proposedEpicName: "Payment Integration",
        proposedEpicDescription: "All payment-related tasks",
        proposedEpicProjectId: project.id,
        candidateEntityIds: [candidate1.id, candidate2.id],
      } as any,
      aiConfidence: 0.8,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.effects.createdEpicId).toBeTruthy();

    // Verify the epic was created
    const epicsRes = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}`,
      apiKey,
    });
    const epicsBody = (await epicsRes.json()) as any;
    const createdEpic = epicsBody.items.find((e: any) => e.id === body.effects.createdEpicId);
    expect(createdEpic).toBeTruthy();
    expect(createdEpic.name).toBe("Payment Integration");

    // Verify follow-up epic_assignment review items were created
    const followUpRes = await authedRequest(app, {
      method: "GET",
      path: `/api/review-queue?reviewType=epic_assignment&status=pending`,
      apiKey,
    });
    const followUpBody = (await followUpRes.json()) as any;
    const candidateIds = followUpBody.items.map((item: any) => item.entityId);
    expect(candidateIds).toContain(candidate1.id);
    expect(candidateIds).toContain(candidate2.id);
  });

  // ----------------------------------------------------------------
  // Rejecting review items
  // ----------------------------------------------------------------

  it("rejects a project_assignment review and clears entity projectId", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();
    const entity = await createTestEntity({ projectId: project.id, type: "task", content: "Misassigned task", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      projectId: project.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project.id } as any,
      aiConfidence: 0.4,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "rejected" },
    });

    expect(res.status).toBe(200);

    // Verify entity projectId was cleared
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.projectId).toBeNull();
  });

  it("rejects a type_classification review and keeps original type", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "This is really a task", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "insight" } as any,
      aiConfidence: 0.3,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "rejected" },
    });

    expect(res.status).toBe(200);

    // Entity type should remain "task"
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.type).toBe("task");
    expect(entityBody.entity.status).toBe("captured");
  });

  // ----------------------------------------------------------------
  // Modified review items
  // ----------------------------------------------------------------

  it("modifies a project_assignment to assign to a different project", async () => {
    const { app, apiKey } = await setup();

    const aiProject = await createTestProject({ name: "AI Suggested" });
    const userProject = await createTestProject({ name: "User Choice" });
    const entity = await createTestEntity({ type: "task", content: "Reassigned task", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      projectId: aiProject.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: aiProject.id } as any,
      aiConfidence: 0.5,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: {
        status: "modified",
        userResolution: { suggestedProjectId: userProject.id },
        trainingComment: "The task belongs to User Choice project, not AI Suggested",
      },
    });

    expect(res.status).toBe(200);

    // Verify entity was assigned to the user-chosen project
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.projectId).toBe(userProject.id);
  });

  it("modifies a type_classification to use a user-chosen type", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Ambiguous item", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision" } as any,
      aiConfidence: 0.4,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: {
        status: "modified",
        userResolution: { suggestedType: "insight" },
        trainingComment: "This is an insight, not a decision",
      },
    });

    expect(res.status).toBe(200);

    // Verify entity type was changed to insight
    const entityRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });
    const entityBody = (await entityRes.json()) as any;
    expect(entityBody.entity.type).toBe("insight");
    expect(entityBody.entity.status).toBe("captured"); // insight default
  });

  // ----------------------------------------------------------------
  // Batch resolve
  // ----------------------------------------------------------------

  it("batch resolves multiple review items at once", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();
    const entity1 = await createTestEntity({ type: "task", content: "Task A", status: "captured" } as any);
    const entity2 = await createTestEntity({ type: "task", content: "Task B", status: "captured" } as any);

    const item1 = await createPendingReviewItem({
      entityId: entity1.id,
      projectId: project.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project.id } as any,
      aiConfidence: 0.7,
    });
    const item2 = await createPendingReviewItem({
      entityId: entity2.id,
      projectId: project.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: project.id } as any,
      aiConfidence: 0.7,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/review-queue/resolve-batch",
      apiKey,
      json: {
        resolutions: [
          { id: item1.id, status: "accepted" },
          { id: item2.id, status: "accepted" },
        ],
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item: any) => item.status === "accepted")).toBe(true);

    // Verify both entities got assigned
    const e1Res = await authedRequest(app, { method: "GET", path: `/api/entities/${entity1.id}`, apiKey });
    const e2Res = await authedRequest(app, { method: "GET", path: `/api/entities/${entity2.id}`, apiKey });
    expect(((await e1Res.json()) as any).entity.projectId).toBe(project.id);
    expect(((await e2Res.json()) as any).entity.projectId).toBe(project.id);
  });

  // ----------------------------------------------------------------
  // Duplicate detection
  // ----------------------------------------------------------------

  it("accepts a duplicate_detection review and creates entity relationship", async () => {
    const { app, apiKey } = await setup();

    const original = await createTestEntity({ type: "task", content: "Fix login bug", status: "captured" } as any);
    const duplicate = await createTestEntity({ type: "task", content: "Login is broken", status: "captured" } as any);

    const reviewItem = await createPendingReviewItem({
      entityId: duplicate.id,
      reviewType: "duplicate_detection" as any,
      aiSuggestion: {
        duplicateEntityId: original.id,
        explanation: "Both describe the same login issue",
        similarityScore: 0.92,
      } as any,
      aiConfidence: 0.85,
    });

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.effects.createdRelationshipId).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // Auto-rejection cascade
  // ----------------------------------------------------------------

  it("accepting type_classification auto-rejects other pending reviews for the same entity", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Multi-review entity", status: "captured" } as any);

    const typeItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "type_classification" as any,
      aiSuggestion: { suggestedType: "decision" } as any,
      aiConfidence: 0.5,
    });
    const projectItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: null } as any,
      aiConfidence: 0.4,
    });

    // Accept the type classification
    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${typeItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.effects.autoResolvedReviewIds).toContain(projectItem.id);

    // Verify the other item is now rejected
    const countRes = await authedRequest(app, {
      method: "GET",
      path: `/api/review-queue/count?entityId=${entity.id}&status=pending`,
      apiKey,
    });
    const countBody = (await countRes.json()) as any;
    expect(countBody.count).toBe(0);
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  it("returns 404 when resolving a non-existent review item", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/review-queue/00000000-0000-0000-0000-000000000000/resolve",
      apiKey,
      json: { status: "accepted" },
    });

    expect(res.status).toBe(404);
  });

  it("returns conflict when resolving an already-resolved review item", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity();
    const reviewItem = await createPendingReviewItem({
      entityId: entity.id,
      reviewType: "project_assignment" as any,
      aiSuggestion: { suggestedProjectId: null } as any,
      aiConfidence: 0.5,
    });

    // Resolve it once
    const res1 = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "rejected" },
    });
    expect(res1.status).toBe(200);

    // Try to resolve again
    const res2 = await authedRequest(app, {
      method: "POST",
      path: `/api/review-queue/${reviewItem.id}/resolve`,
      apiKey,
      json: { status: "accepted" },
    });
    // Should be either 404 (not found as pending) or 409 (conflict)
    expect([404, 409]).toContain(res2.status);
  });
});
