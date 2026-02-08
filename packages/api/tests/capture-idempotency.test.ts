import { describe, expect, it, vi } from "vitest";

import { db } from "../src/db/index.js";
import { rawNotes } from "../src/db/schema/index.js";
import { createTestUser } from "./factories.js";

vi.mock("../src/jobs/queue.js", async () => {
  const actual = await vi.importActual<any>("../src/jobs/queue.js");
  return {
    ...actual,
    notesExtractQueue: {
      add: vi.fn().mockResolvedValue(null),
    },
    notesReprocessQueue: {
      add: vi.fn().mockResolvedValue(null),
    },
  };
});

const { captureNote } = await import("../src/services/capture.js");
const { notesExtractQueue } = await import("../src/jobs/queue.js");

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

    expect((notesExtractQueue as any).add).toHaveBeenCalledTimes(1);
  });
});

