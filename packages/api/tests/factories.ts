import { randomUUID } from "node:crypto";

import { db } from "../src/db/index.js";
import { apiKeys, entities, projects, rawNotes, reviewQueue, users } from "../src/db/schema/index.js";
import { generateApiKey, hashApiKey } from "../src/services/auth.js";

export async function createTestUser(overrides?: Partial<typeof users.$inferInsert>) {
  const [row] = await db
    .insert(users)
    .values({
      name: "Test User",
      email: `test-${randomUUID()}@example.com`,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function createTestProject(overrides?: Partial<typeof projects.$inferInsert>) {
  const [row] = await db
    .insert(projects)
    .values({
      name: `Test Project ${randomUUID().slice(0, 8)}`,
      description: null,
      status: "active",
      ...overrides,
    } as any)
    .returning();
  return row!;
}

export async function createTestEntity(overrides?: Partial<typeof entities.$inferInsert>) {
  const [row] = await db
    .insert(entities)
    .values({
      type: "task",
      content: "Test entity",
      status: "captured",
      confidence: 1,
      projectId: null,
      epicId: null,
      assigneeId: null,
      attributes: {},
      evidence: [],
      ...overrides,
    } as any)
    .returning();
  return row!;
}

export async function createTestRawNote(overrides?: Partial<typeof rawNotes.$inferInsert>) {
  const [row] = await db
    .insert(rawNotes)
    .values({
      content: "Test raw note",
      source: "cli",
      processed: false,
      ...overrides,
    } as any)
    .returning();
  return row!;
}

export async function createTestApiKey(opts: { userId: string; name?: string; plaintextKey?: string }) {
  const { plaintextKey, keyHash } = opts.plaintextKey
    ? { plaintextKey: opts.plaintextKey, keyHash: await hashApiKey(opts.plaintextKey) }
    : await generateApiKey();

  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: opts.userId,
      name: opts.name ?? "test key",
      keyHash,
    })
    .returning();

  return { apiKey: row!, plaintextKey };
}

export async function createPendingReviewItem(overrides: Partial<typeof reviewQueue.$inferInsert>) {
  const [row] = await db
    .insert(reviewQueue)
    .values({
      reviewType: "low_confidence",
      status: "pending",
      aiSuggestion: { explanation: "test" } as any,
      aiConfidence: 0.5,
      ...overrides,
    } as any)
    .returning();
  return row!;
}
