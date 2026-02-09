import { describe, expect, it, vi } from "vitest";

import { db } from "../src/db/index.js";
import { rawNotes } from "../src/db/schema/index.js";
import { createTestUser } from "./factories.js";

const mockAdd = vi.fn().mockResolvedValue(null);

// Mock the queue module so ioredis never tries to connect to Redis.
vi.mock("../src/jobs/queue.js", () => ({
  getNotesExtractQueue: () => ({ add: mockAdd }),
  getNotesReprocessQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesOrganizeQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesComputeEmbeddingsQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getReviewQueueExportTrainingDataQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  DEFAULT_JOB_OPTS: { removeOnComplete: true, removeOnFail: 500 },
  isRedisConfigured: () => true,
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

const { captureNote } = await import("../src/services/capture.js");

describe("captureNote idempotency", () => {
  it("dedupes by (source, externalId) and only enqueues on creation", async () => {
    const user = await createTestUser();

    const input = {
      content: "hello",
      source: "cli" as const,
      externalId: "ext-1",
    };

    const first = await captureNote({ input, capturedByUserId: user.id });
    expect(first.deduped).toBe(false);

    const second = await captureNote({ input, capturedByUserId: user.id });
    expect(second.deduped).toBe(true);
    expect(second.note.id).toBe(first.note.id);

    const rows = await db.select().from(rawNotes);
    expect(rows.length).toBe(1);

    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});

