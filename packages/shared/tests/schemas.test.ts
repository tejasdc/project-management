import { describe, expect, it } from "vitest";

import {
  captureNoteSchema,
  entityWithAttributesSchema,
  taskAttributesSchema,
} from "../src/schemas";

describe("shared schemas", () => {
  it("accepts a minimal capture note", () => {
    const res = captureNoteSchema.safeParse({ content: "hello", source: "cli" });
    expect(res.success).toBe(true);
  });

  it("rejects an empty capture note", () => {
    const res = captureNoteSchema.safeParse({ content: "", source: "cli" });
    expect(res.success).toBe(false);
  });

  it("accepts decision attributes with decidedBy", () => {
    const res = entityWithAttributesSchema.safeParse({
      type: "decision",
      attributes: {
        options: ["A", "B"],
        chosen: "A",
        rationale: "Because.",
        decidedBy: "Alex",
      },
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid task priority", () => {
    const res = taskAttributesSchema.safeParse({ priority: "urgent" });
    expect(res.success).toBe(false);
  });
});

