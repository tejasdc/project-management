import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createTestApiKey, createTestUser } from "./factories.js";
import { expectError } from "./helpers.js";

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

describe("auth middleware", () => {
  it("rejects requests without Authorization", async () => {
    const app = createApp();
    const res = await app.request("/api/auth/me");
    await expectError(res, { status: 401 });
  });

  it("accepts requests with a valid API key", async () => {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });

    const app = createApp();
    const res = await app.request("/api/auth/me", {
      headers: { authorization: `Bearer ${plaintextKey}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.user?.id).toBe(user.id);
  });
});

