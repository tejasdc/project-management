import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { db } from "../src/db/index.js";
import { epics } from "../src/db/schema/index.js";
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

describe("epic management flow", () => {
  async function setup() {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    return { user, apiKey: plaintextKey, app };
  }

  // ----------------------------------------------------------------
  // Epic CRUD
  // ----------------------------------------------------------------

  it("creates an epic within a project", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Epic Host" });

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: {
        name: "Authentication",
        description: "All authentication and authorization related work",
        projectId: project.id,
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.epic.name).toBe("Authentication");
    expect(body.epic.description).toBe("All authentication and authorization related work");
    expect(body.epic.projectId).toBe(project.id);
    expect(body.epic.createdBy).toBe("user");
    expect(body.epic.id).toBeDefined();
  });

  it("creates multiple epics for a project", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Multi-Epic Project" });

    const epicNames = [
      "User Management",
      "Payment Integration",
      "Notifications System",
      "API Gateway",
    ];

    for (const name of epicNames) {
      const res = await authedRequest(app, {
        method: "POST",
        path: "/api/epics",
        apiKey,
        json: { name, projectId: project.id },
      });
      expect(res.status).toBe(201);
    }

    // List all epics for the project
    const listRes = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}`,
      apiKey,
    });

    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.items).toHaveLength(4);
    const names = listBody.items.map((e: any) => e.name);
    for (const name of epicNames) {
      expect(names).toContain(name);
    }
  });

  it("updates an epic name and description via PATCH", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();

    const createRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Old Epic Name", description: "Old description", projectId: project.id },
    });
    const epic = ((await createRes.json()) as any).epic;

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/epics/${epic.id}`,
      apiKey,
      json: { name: "Renamed Epic", description: "Updated description with more detail" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.epic.name).toBe("Renamed Epic");
    expect(body.epic.description).toBe("Updated description with more detail");
  });

  it("rejects PATCH deletedAt with an ISO string (schema expects Date)", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();

    const createRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Deletable Epic", projectId: project.id },
    });
    const epic = ((await createRes.json()) as any).epic;

    // The PATCH schema derives deletedAt from createInsertSchema which produces
    // z.date(), so an ISO string is rejected with 422.
    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/epics/${epic.id}`,
      apiKey,
      json: { deletedAt: new Date().toISOString() },
    });

    expect(res.status).toBe(422);
  });

  it("lists deleted epics with includeDeleted=true", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();

    const createRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Visible Epic", projectId: project.id },
    });
    const visibleEpic = ((await createRes.json()) as any).epic;

    const createRes2 = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Hidden Epic", projectId: project.id },
    });
    const hiddenEpic = ((await createRes2.json()) as any).epic;

    // Soft-delete the hidden epic directly via DB (the PATCH endpoint's Zod
    // schema doesn't accept ISO-string dates, so we bypass the API here).
    await db.update(epics).set({ deletedAt: new Date() }).where(eq(epics.id, hiddenEpic.id));

    // Default list excludes deleted
    const defaultRes = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}`,
      apiKey,
    });
    const defaultBody = (await defaultRes.json()) as any;
    expect(defaultBody.items).toHaveLength(1);

    // Include deleted
    const allRes = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}&includeDeleted=true`,
      apiKey,
    });
    const allBody = (await allRes.json()) as any;
    expect(allBody.items).toHaveLength(2);
  });

  // ----------------------------------------------------------------
  // Assigning entities to epics
  // ----------------------------------------------------------------

  it("assigns entities to an epic and verifies via entity list", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Entity Assignment Project" });

    const epicRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Frontend Epic", projectId: project.id },
    });
    const epic = ((await epicRes.json()) as any).epic;

    // Create entities and assign some to the epic
    const entity1 = await createTestEntity({ projectId: project.id, type: "task", content: "Build header component", status: "captured" } as any);
    const entity2 = await createTestEntity({ projectId: project.id, type: "task", content: "Build footer component", status: "captured" } as any);
    const entity3 = await createTestEntity({ projectId: project.id, type: "task", content: "Unepiced task", status: "captured" } as any);

    // Assign entity1 and entity2 to the epic
    await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity1.id}`,
      apiKey,
      json: { epicId: epic.id },
    });
    await authedRequest(app, {
      method: "PATCH",
      path: `/api/entities/${entity2.id}`,
      apiKey,
      json: { epicId: epic.id },
    });

    // List entities by epicId
    const epicEntitiesRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities?epicId=${epic.id}`,
      apiKey,
    });
    const epicEntitiesBody = (await epicEntitiesRes.json()) as any;
    expect(epicEntitiesBody.items).toHaveLength(2);
    const epicEntityIds = epicEntitiesBody.items.map((e: any) => e.id);
    expect(epicEntityIds).toContain(entity1.id);
    expect(epicEntityIds).toContain(entity2.id);
    expect(epicEntityIds).not.toContain(entity3.id);
  });

  it("unepiced entities show separately (not in any epic filter)", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Unepiced Test" });

    const epicRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Organized Epic", projectId: project.id },
    });
    const epic = ((await epicRes.json()) as any).epic;

    // One in epic, one not
    const inEpic = await createTestEntity({ projectId: project.id, epicId: epic.id, type: "task", content: "In the epic", status: "captured" } as any);
    const notInEpic = await createTestEntity({ projectId: project.id, type: "task", content: "Not in any epic", status: "captured" } as any);

    // Get all project entities
    const allRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities?projectId=${project.id}`,
      apiKey,
    });
    const allBody = (await allRes.json()) as any;
    expect(allBody.items).toHaveLength(2);

    // Get only epic entities
    const epicOnlyRes = await authedRequest(app, {
      method: "GET",
      path: `/api/entities?epicId=${epic.id}`,
      apiKey,
    });
    const epicOnlyBody = (await epicOnlyRes.json()) as any;
    expect(epicOnlyBody.items).toHaveLength(1);
    expect(epicOnlyBody.items[0].id).toBe(inEpic.id);
  });

  // ----------------------------------------------------------------
  // Epic progress in dashboard
  // ----------------------------------------------------------------

  it("shows epic progress with mixed entity statuses in project dashboard", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Progress Dashboard" });

    // Create two epics
    const epic1Res = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Backend", projectId: project.id },
    });
    const epic1 = ((await epic1Res.json()) as any).epic;

    const epic2Res = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Frontend", projectId: project.id },
    });
    const epic2 = ((await epic2Res.json()) as any).epic;

    // Backend epic: 3 tasks (1 done, 1 in_progress, 1 captured)
    await createTestEntity({ projectId: project.id, epicId: epic1.id, type: "task", content: "API routes", status: "done" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic1.id, type: "task", content: "Database schema", status: "in_progress" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic1.id, type: "task", content: "Auth middleware", status: "captured" } as any);

    // Frontend epic: 2 tasks (2 done)
    await createTestEntity({ projectId: project.id, epicId: epic2.id, type: "task", content: "React setup", status: "done" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic2.id, type: "task", content: "Component library", status: "done" } as any);

    // Unepiced task
    await createTestEntity({ projectId: project.id, type: "task", content: "Write documentation", status: "captured" } as any);

    const dashRes = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(dashRes.status).toBe(200);
    const dashBody = (await dashRes.json()) as any;

    expect(dashBody.epics).toHaveLength(2);

    // Find each epic in the response
    const backendEpic = dashBody.epics.find((e: any) => e.epic.name === "Backend");
    const frontendEpic = dashBody.epics.find((e: any) => e.epic.name === "Frontend");

    expect(backendEpic).toBeTruthy();
    expect(backendEpic.progress.totalTasks).toBe(3);
    expect(backendEpic.progress.doneTasks).toBe(1);
    expect(backendEpic.progress.percent).toBeCloseTo(1 / 3, 2);
    expect(backendEpic.tasksByStatus.done).toBe(1);
    expect(backendEpic.tasksByStatus.in_progress).toBe(1);
    expect(backendEpic.tasksByStatus.captured).toBe(1);

    expect(frontendEpic).toBeTruthy();
    expect(frontendEpic.progress.totalTasks).toBe(2);
    expect(frontendEpic.progress.doneTasks).toBe(2);
    expect(frontendEpic.progress.percent).toBe(1);

    // Total entities includes unepiced
    expect(dashBody.stats.totalEntities).toBe(6);
  });

  it("shows empty epic with zero progress", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Empty Epic Project" });

    await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Empty Epic", projectId: project.id },
    });

    const dashRes = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(dashRes.status).toBe(200);
    const dashBody = (await dashRes.json()) as any;
    expect(dashBody.epics).toHaveLength(1);
    expect(dashBody.epics[0].epic.name).toBe("Empty Epic");
    expect(dashBody.epics[0].progress.totalTasks).toBe(0);
    expect(dashBody.epics[0].progress.doneTasks).toBe(0);
    expect(dashBody.epics[0].progress.percent).toBe(0);
  });

  // ----------------------------------------------------------------
  // Pagination
  // ----------------------------------------------------------------

  it("paginates epic list", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Paginated Epics" });

    // Create 4 epics
    for (let i = 0; i < 4; i++) {
      await authedRequest(app, {
        method: "POST",
        path: "/api/epics",
        apiKey,
        json: { name: `Epic ${i}`, projectId: project.id },
      });
    }

    const res1 = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}&limit=2`,
      apiKey,
    });

    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as any;
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();

    const res2 = await authedRequest(app, {
      method: "GET",
      path: `/api/epics?projectId=${project.id}&limit=2&cursor=${body1.nextCursor}`,
      apiKey,
    });

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.items).toHaveLength(2);
    expect(body2.nextCursor).toBeNull();
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  it("returns 404 when patching non-existent epic", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "PATCH",
      path: "/api/epics/00000000-0000-0000-0000-000000000000",
      apiKey,
      json: { name: "Ghost Epic" },
    });

    expect(res.status).toBe(404);
  });

  it("rejects epic creation with empty name", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "", projectId: project.id },
    });

    expect(res.ok).toBe(false);
  });

  it("requires projectId when listing epics", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/epics",
      apiKey,
    });

    // Should fail validation (projectId is required in the query schema)
    expect(res.ok).toBe(false);
  });

  it("epic decisions and insights are NOT counted in epic progress (only tasks)", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Non-Task Epic" });

    const epicRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Mixed Types", projectId: project.id },
    });
    const epic = ((await epicRes.json()) as any).epic;

    // Add non-task entities to the epic
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "decision", content: "Choose framework", status: "decided" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "insight", content: "Performance insight", status: "captured" } as any);
    // Add one task
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "task", content: "Implement feature", status: "done" } as any);

    const dashRes = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    const dashBody = (await dashRes.json()) as any;
    const epicSummary = dashBody.epics.find((e: any) => e.epic.name === "Mixed Types");
    expect(epicSummary).toBeTruthy();
    // Only the task counts toward progress
    expect(epicSummary.progress.totalTasks).toBe(1);
    expect(epicSummary.progress.doneTasks).toBe(1);
    expect(epicSummary.progress.percent).toBe(1);
  });
});
