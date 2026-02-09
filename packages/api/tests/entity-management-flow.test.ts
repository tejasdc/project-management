import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createTestApiKey, createTestEntity, createTestProject, createTestUser } from "./factories.js";
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

describe("entity management flow", () => {
  async function setup() {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    return { user, apiKey: plaintextKey, app };
  }

  // ----------------------------------------------------------------
  // Entity creation
  // ----------------------------------------------------------------

  it("creates a task entity via POST /api/entities", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: {
        type: "task",
        content: "Implement user authentication with OAuth2",
        status: "captured",
        confidence: 0.95,
        attributes: {
          category: "feature",
          priority: "high",
          complexity: "large",
        },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.entity.type).toBe("task");
    expect(body.entity.content).toBe("Implement user authentication with OAuth2");
    expect(body.entity.status).toBe("captured");
    expect(body.entity.confidence).toBe(0.95);
    expect(body.entity.attributes.category).toBe("feature");
    expect(body.entity.attributes.priority).toBe("high");
    expect(body.entity.attributes.complexity).toBe("large");
  });

  it("creates a decision entity", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: {
        type: "decision",
        content: "Use PostgreSQL instead of MongoDB for primary datastore",
        status: "pending",
        confidence: 0.88,
        attributes: {
          options: ["PostgreSQL", "MongoDB", "DynamoDB"],
          rationale: "Better ACID compliance and relational modeling",
          decidedBy: "CTO",
        },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.entity.type).toBe("decision");
    expect(body.entity.status).toBe("pending");
    expect(body.entity.attributes.options).toEqual(["PostgreSQL", "MongoDB", "DynamoDB"]);
  });

  it("creates an insight entity", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: {
        type: "insight",
        content: "60% of users abandon the onboarding flow at step 3",
        status: "captured",
        confidence: 0.92,
        attributes: {
          sentiment: "negative",
          dataPoints: ["60% abandonment", "step 3 is form-heavy", "mobile users affected most"],
          feasibility: "high",
        },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.entity.type).toBe("insight");
    expect(body.entity.attributes.sentiment).toBe("negative");
    expect(body.entity.attributes.dataPoints).toHaveLength(3);
  });

  // ----------------------------------------------------------------
  // Entity retrieval and filtering
  // ----------------------------------------------------------------

  it("gets a single entity by id", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({
      type: "task",
      content: "Specific task to fetch",
      status: "captured",
    } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.id).toBe(entity.id);
    expect(body.entity.content).toBe("Specific task to fetch");
  });

  it("lists entities filtered by type", async () => {
    const { app, apiKey } = await setup();

    await createTestEntity({ type: "task", content: "Task 1", status: "captured" } as any);
    await createTestEntity({ type: "decision", content: "Decision 1", status: "pending" } as any);
    await createTestEntity({ type: "insight", content: "Insight 1", status: "captured" } as any);
    await createTestEntity({ type: "task", content: "Task 2", status: "done" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/entities?type=task",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.items.every((e: any) => e.type === "task")).toBe(true);
  });

  it("lists entities filtered by projectId", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Filter Project" });
    await createTestEntity({ projectId: project.id, type: "task", content: "In project", status: "captured" } as any);
    await createTestEntity({ type: "task", content: "No project", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/entities?projectId=${project.id}`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].content).toBe("In project");
  });

  it("lists entities filtered by status", async () => {
    const { app, apiKey } = await setup();

    await createTestEntity({ type: "task", content: "Captured task", status: "captured" } as any);
    await createTestEntity({ type: "task", content: "Done task", status: "done" } as any);
    await createTestEntity({ type: "task", content: "In progress task", status: "in_progress" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/entities?status=done",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].content).toBe("Done task");
  });

  // ----------------------------------------------------------------
  // Status transitions (task lifecycle)
  // ----------------------------------------------------------------

  it("transitions a task through its full lifecycle: captured -> needs_action -> in_progress -> done", async () => {
    const { app, apiKey } = await setup();

    const createRes = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: { type: "task", content: "Full lifecycle task", status: "captured", confidence: 1 },
    });
    expect(createRes.status).toBe(201);
    const entity = ((await createRes.json()) as any).entity;

    // captured -> needs_action
    const res1 = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "needs_action" },
    });
    expect(res1.status).toBe(200);
    expect(((await res1.json()) as any).entity.status).toBe("needs_action");

    // needs_action -> in_progress
    const res2 = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "in_progress" },
    });
    expect(res2.status).toBe(200);
    expect(((await res2.json()) as any).entity.status).toBe("in_progress");

    // in_progress -> done
    const res3 = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "done" },
    });
    expect(res3.status).toBe(200);
    expect(((await res3.json()) as any).entity.status).toBe("done");
  });

  it("transitions a decision: pending -> decided", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "decision", content: "Pick a framework", status: "pending" } as any);

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "decided" },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).entity.status).toBe("decided");
  });

  it("transitions an insight: captured -> acknowledged", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "insight", content: "Performance insight", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "acknowledged" },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as any).entity.status).toBe("acknowledged");
  });

  it("rejects invalid status transitions", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Invalid transition", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "decided" }, // "decided" is not valid for tasks
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  // ----------------------------------------------------------------
  // Entity events (status_change events created by transitions)
  // ----------------------------------------------------------------

  it("creates status_change events for each transition", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Events task", status: "captured" } as any);

    // Perform two transitions
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "needs_action" },
    });
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "in_progress" },
    });

    // List events
    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    const statusChanges = body.items.filter((e: any) => e.type === "status_change");
    expect(statusChanges.length).toBe(2);

    // Events are returned desc by default; most recent first
    expect(statusChanges[0].oldStatus).toBe("needs_action");
    expect(statusChanges[0].newStatus).toBe("in_progress");
    expect(statusChanges[1].oldStatus).toBe("captured");
    expect(statusChanges[1].newStatus).toBe("needs_action");
  });

  // ----------------------------------------------------------------
  // Comments
  // ----------------------------------------------------------------

  it("adds a comment to an entity", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Comment target", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
      json: {
        type: "comment",
        body: "This task needs more context. Can someone clarify the requirements?",
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.event.type).toBe("comment");
    expect(body.event.body).toContain("needs more context");
    expect(body.event.entityId).toBe(entity.id);
  });

  it("lists comments and status changes together in entity events", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Mixed events", status: "captured" } as any);

    // Add a comment
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
      json: { type: "comment", body: "Starting work on this" },
    });

    // Transition status
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "in_progress" },
    });

    // Add another comment
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
      json: { type: "comment", body: "Almost done, just fixing edge cases" },
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(3);

    const types = body.items.map((e: any) => e.type);
    expect(types).toContain("comment");
    expect(types).toContain("status_change");
  });

  // ----------------------------------------------------------------
  // Entity assignment (project and epic)
  // ----------------------------------------------------------------

  it("assigns an entity to a project via PATCH", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Assignment Target" });
    const entity = await createTestEntity({ type: "task", content: "Unassigned task", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity.id}`,
      apiKey,
      json: { projectId: project.id },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.projectId).toBe(project.id);
  });

  it("assigns an entity to an epic via PATCH", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Epic Parent" });

    // Create epic via API
    const epicRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Backend Epic", projectId: project.id },
    });
    const epic = ((await epicRes.json()) as any).epic;

    const entity = await createTestEntity({ projectId: project.id, type: "task", content: "Epic task", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity.id}`,
      apiKey,
      json: { epicId: epic.id },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.epicId).toBe(epic.id);
  });

  it("unassigns entity from project by setting null", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();
    const entity = await createTestEntity({ projectId: project.id, type: "task", content: "Remove from project", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity.id}`,
      apiKey,
      json: { projectId: null },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.projectId).toBeNull();
  });

  // ----------------------------------------------------------------
  // Content update
  // ----------------------------------------------------------------

  it("updates entity content via PATCH", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Original content", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity.id}`,
      apiKey,
      json: { content: "Updated and clarified content with more detail" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.content).toBe("Updated and clarified content with more detail");
  });

  // ----------------------------------------------------------------
  // AI metadata structure
  // ----------------------------------------------------------------

  it("preserves aiMeta and evidence fields on entities", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: {
        type: "task",
        content: "Entity with AI metadata",
        status: "captured",
        confidence: 0.72,
        aiMeta: {
          model: "claude-3",
          extractedAt: new Date().toISOString(),
          fieldConfidence: {
            type: 0.95,
            content: 0.88,
            project: 0.45,
          },
        },
        evidence: [
          { rawNoteId: "00000000-0000-0000-0000-000000000001", snippet: "We need to add auth", charRange: [0, 20] },
        ],
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.entity.confidence).toBe(0.72);
    expect(body.entity.aiMeta).toBeDefined();
    expect(body.entity.aiMeta.model).toBe("claude-3");
    expect(body.entity.aiMeta.fieldConfidence.type).toBe(0.95);
    expect(body.entity.evidence).toHaveLength(1);
    expect(body.entity.evidence[0].snippet).toBe("We need to add auth");
  });

  // ----------------------------------------------------------------
  // Pagination
  // ----------------------------------------------------------------

  it("paginates entity list with cursor", async () => {
    const { app, apiKey } = await setup();

    // Create 5 entities with distinct createdAt values so cursor pagination
    // (which serializes timestamps via Date.toISOString at ms precision) does
    // not lose items across page boundaries.
    const baseTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await createTestEntity({
        type: "task",
        content: `Task ${i}`,
        status: "captured",
        createdAt: new Date(baseTime + i * 1000),
      } as any);
    }

    const res1 = await authedRequest(app, {
      method: "GET",
      path: "/api/entities?limit=3",
      apiKey,
    });

    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as any;
    expect(body1.items).toHaveLength(3);
    expect(body1.nextCursor).toBeTruthy();

    const res2 = await authedRequest(app, {
      method: "GET",
      path: `/api/entities?limit=3&cursor=${body1.nextCursor}`,
      apiKey,
    });

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.items).toHaveLength(2);
    expect(body2.nextCursor).toBeNull();

    // No overlapping IDs between pages
    const ids1 = new Set(body1.items.map((e: any) => e.id));
    const ids2 = new Set(body2.items.map((e: any) => e.id));
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  it("returns 404 for non-existent entity", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/entities/00000000-0000-0000-0000-000000000000",
      apiKey,
    });

    expect(res.status).toBe(404);
  });

  it("rejects entity creation with empty content", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/entities",
      apiKey,
      json: { type: "task", content: "", status: "captured", confidence: 1 },
    });

    expect(res.ok).toBe(false);
  });

  it("returns no-op when transitioning to the same status", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Same status", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/status`,
      apiKey,
      json: { newStatus: "captured" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.entity.status).toBe("captured");
  });

  it("supports event listing in ascending order", async () => {
    const { app, apiKey } = await setup();

    const entity = await createTestEntity({ type: "task", content: "Order test", status: "captured" } as any);

    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
      json: { type: "comment", body: "First comment" },
    });
    await authedRequest(app, {
      method: "POST",
      path: `/api/entities/${entity.id}/events`,
      apiKey,
      json: { type: "comment", body: "Second comment" },
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/entities/${entity.id}/events?order=asc`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items[0].body).toBe("First comment");
    expect(body.items[1].body).toBe("Second comment");
  });
});
