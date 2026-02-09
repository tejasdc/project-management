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

describe("projects dashboard flow", () => {
  async function setup() {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    return { user, apiKey: plaintextKey, app };
  }

  // ----------------------------------------------------------------
  // Project CRUD
  // ----------------------------------------------------------------

  it("creates a project via POST /api/projects", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/projects",
      apiKey,
      json: { name: "Website Redesign", description: "Complete overhaul of the marketing site" },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.project.name).toBe("Website Redesign");
    expect(body.project.description).toBe("Complete overhaul of the marketing site");
    expect(body.project.status).toBe("active");
    expect(body.project.id).toBeDefined();
  });

  it("lists only active projects by default", async () => {
    const { app, apiKey } = await setup();

    const active1 = await createTestProject({ name: "Active Project 1", status: "active" });
    const active2 = await createTestProject({ name: "Active Project 2", status: "active" });
    const archived = await createTestProject({ name: "Archived Project", status: "archived" });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/projects",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const names = body.items.map((p: any) => p.name);
    expect(names).toContain("Active Project 1");
    expect(names).toContain("Active Project 2");
    expect(names).not.toContain("Archived Project");
  });

  it("lists archived projects when filtered by status=archived", async () => {
    const { app, apiKey } = await setup();

    await createTestProject({ name: "Active Project", status: "active" });
    await createTestProject({ name: "Archived Project", status: "archived" });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/projects?status=archived",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const names = body.items.map((p: any) => p.name);
    expect(names).toContain("Archived Project");
    expect(names).not.toContain("Active Project");
  });

  it("lists all projects when status=all", async () => {
    const { app, apiKey } = await setup();

    await createTestProject({ name: "Active", status: "active" });
    await createTestProject({ name: "Archived", status: "archived" });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/projects?status=all",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const names = body.items.map((p: any) => p.name);
    expect(names).toContain("Active");
    expect(names).toContain("Archived");
  });

  it("updates project name and description via PATCH", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Old Name", description: "Old description" } as any);

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/projects/${project.id}`,
      apiKey,
      json: { name: "New Name", description: "Updated description" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.project.name).toBe("New Name");
    expect(body.project.description).toBe("Updated description");
  });

  it("archives a project via PATCH status", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Soon Archived", status: "active" });

    const res = await authedRequest(app, {
      method: "PATCH",
      path: `/api/projects/${project.id}`,
      apiKey,
      json: { status: "archived" },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.project.status).toBe("archived");

    // Verify it no longer shows in default active list
    const listRes = await authedRequest(app, {
      method: "GET",
      path: "/api/projects",
      apiKey,
    });
    const listBody = (await listRes.json()) as any;
    const ids = listBody.items.map((p: any) => p.id);
    expect(ids).not.toContain(project.id);
  });

  // ----------------------------------------------------------------
  // Project dashboard with stats
  // ----------------------------------------------------------------

  it("returns project dashboard with tasksByStatus breakdown", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Dashboard Project" });

    // Create tasks in various statuses
    await createTestEntity({ projectId: project.id, type: "task", content: "Setup CI pipeline", status: "captured" } as any);
    await createTestEntity({ projectId: project.id, type: "task", content: "Fix login bug", status: "needs_action" } as any);
    await createTestEntity({ projectId: project.id, type: "task", content: "Implement OAuth", status: "in_progress" } as any);
    await createTestEntity({ projectId: project.id, type: "task", content: "Add health check", status: "done" } as any);
    await createTestEntity({ projectId: project.id, type: "task", content: "Write tests", status: "done" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.project.id).toBe(project.id);
    expect(body.stats.tasksByStatus.captured).toBe(1);
    expect(body.stats.tasksByStatus.needs_action).toBe(1);
    expect(body.stats.tasksByStatus.in_progress).toBe(1);
    expect(body.stats.tasksByStatus.done).toBe(2);
  });

  it("returns openDecisions count in dashboard", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Decisions Project" });

    // Create decisions: 2 pending, 1 decided
    await createTestEntity({ projectId: project.id, type: "decision", content: "Choose database engine", status: "pending" } as any);
    await createTestEntity({ projectId: project.id, type: "decision", content: "Pick CI provider", status: "pending" } as any);
    await createTestEntity({ projectId: project.id, type: "decision", content: "Use TypeScript", status: "decided" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.stats.openDecisions).toBe(2);
  });

  it("returns recentInsights count in dashboard", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Insights Project" });

    // Create recent insights
    await createTestEntity({ projectId: project.id, type: "insight", content: "Users prefer dark mode", status: "captured" } as any);
    await createTestEntity({ projectId: project.id, type: "insight", content: "Mobile traffic is 60%", status: "acknowledged" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.stats.recentInsights).toBe(2);
  });

  it("returns totalEntities in dashboard", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Total Count Project" });

    await createTestEntity({ projectId: project.id, type: "task", content: "Task 1", status: "captured" } as any);
    await createTestEntity({ projectId: project.id, type: "decision", content: "Decision 1", status: "pending" } as any);
    await createTestEntity({ projectId: project.id, type: "insight", content: "Insight 1", status: "captured" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.stats.totalEntities).toBe(3);
  });

  it("returns epic progress summary in dashboard", async () => {
    const { app, apiKey, user } = await setup();

    const project = await createTestProject({ name: "Epic Progress Project" });

    // Create an epic via the API
    const epicRes = await authedRequest(app, {
      method: "POST",
      path: "/api/epics",
      apiKey,
      json: { name: "Authentication Epic", projectId: project.id },
    });
    expect(epicRes.status).toBe(201);
    const epic = ((await epicRes.json()) as any).epic;

    // Create tasks in the epic: 2 done, 1 in_progress
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "task", content: "Design auth flow", status: "done" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "task", content: "Implement OAuth", status: "done" } as any);
    await createTestEntity({ projectId: project.id, epicId: epic.id, type: "task", content: "Add MFA", status: "in_progress" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.epics).toHaveLength(1);
    expect(body.epics[0].epic.name).toBe("Authentication Epic");
    expect(body.epics[0].progress.totalTasks).toBe(3);
    expect(body.epics[0].progress.doneTasks).toBe(2);
    // 2/3 ~ 0.6667
    expect(body.epics[0].progress.percent).toBeCloseTo(2 / 3, 2);
  });

  it("returns recentEntities in dashboard", async () => {
    const { app, apiKey } = await setup();

    const project = await createTestProject({ name: "Recent Entities Project" });

    await createTestEntity({ projectId: project.id, type: "task", content: "Recent task", status: "captured" } as any);
    await createTestEntity({ projectId: project.id, type: "decision", content: "Recent decision", status: "pending" } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: `/api/projects/${project.id}/dashboard`,
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.recentEntities.length).toBe(2);
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------

  it("returns 404 for dashboard of non-existent project", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/projects/00000000-0000-0000-0000-000000000000/dashboard",
      apiKey,
    });

    expect(res.status).toBe(404);
  });

  it("pagination returns nextCursor when more projects exist", async () => {
    const { app, apiKey } = await setup();

    // Create 3 projects with distinct updatedAt values so cursor pagination
    // (which serializes timestamps via Date.toISOString at ms precision) does
    // not lose items across page boundaries.
    const baseTime = Date.now();
    await createTestProject({ name: "Project A", updatedAt: new Date(baseTime) } as any);
    await createTestProject({ name: "Project B", updatedAt: new Date(baseTime + 1000) } as any);
    await createTestProject({ name: "Project C", updatedAt: new Date(baseTime + 2000) } as any);

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/projects?limit=2",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();

    // Fetch next page
    const res2 = await authedRequest(app, {
      method: "GET",
      path: `/api/projects?limit=2&cursor=${body.nextCursor}`,
      apiKey,
    });

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.items).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
  });
});
