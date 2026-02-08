// src/db/validation.ts

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { entities } from "./schema/entities.js";
import { rawNotes } from "./schema/raw-notes.js";
import { projects } from "./schema/projects.js";
import { epics } from "./schema/epics.js";
import { reviewQueue } from "./schema/review-queue.js";
import { users } from "./schema/users.js";
import { apiKeys } from "./schema/api-keys.js";
import { tags } from "./schema/tags.js";
import { entityEvents } from "./schema/entity-events.js";

// ============================================================
// Auto-generated schemas from Drizzle tables
// ============================================================

// -- Entities --
export const entityInsertSchema = createInsertSchema(entities, {
  // Override/refine auto-generated types where needed
  content: (schema) => schema.min(1, "Content cannot be empty"),
  confidence: (schema) => schema.min(0).max(1),
});

export const entitySelectSchema = createSelectSchema(entities);

// -- Raw Notes --
export const rawNoteInsertSchema = createInsertSchema(rawNotes, {
  content: (schema) => schema.min(1, "Content cannot be empty"),
});

export const rawNoteSelectSchema = createSelectSchema(rawNotes);

// -- Projects --
export const projectInsertSchema = createInsertSchema(projects, {
  name: (schema) => schema.min(1, "Project name cannot be empty"),
});

export const projectSelectSchema = createSelectSchema(projects);

// -- Epics --
export const epicInsertSchema = createInsertSchema(epics, {
  name: (schema) => schema.min(1, "Epic name cannot be empty"),
});

export const epicSelectSchema = createSelectSchema(epics);

// -- Review Queue --
export const reviewQueueInsertSchema = createInsertSchema(reviewQueue);
export const reviewQueueSelectSchema = createSelectSchema(reviewQueue);

// -- Users --
export const userInsertSchema = createInsertSchema(users, {
  name: (schema) => schema.min(1, "Name cannot be empty"),
  email: (schema) => schema.email("Invalid email"),
});
export const userSelectSchema = createSelectSchema(users);

// -- API Keys --
// Never return key hashes to clients.
export const apiKeySelectSchema = createSelectSchema(apiKeys).omit({
  keyHash: true,
});

// -- Tags --
export const tagInsertSchema = createInsertSchema(tags, {
  name: (schema) => schema.min(1).transform((s) => s.trim().toLowerCase()),
});
export const tagSelectSchema = createSelectSchema(tags);

// -- Entity Events --
export const entityEventInsertSchema = createInsertSchema(entityEvents, {
  body: (schema) => schema.min(1, "Body cannot be empty"),
});
export const entityEventSelectSchema = createSelectSchema(entityEvents);

// ============================================================
// Custom Zod schemas for JSONB validation
// ============================================================

export const taskAttributesSchema = z.object({
  category: z
    .enum(["feature", "bug_fix", "improvement", "chore", "refactor", "story"])
    .optional(),
  owner: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  complexity: z.enum(["small", "medium", "large"]).optional(),
}).passthrough();

export const decisionAttributesSchema = z.object({
  options: z.array(z.string()).optional(),
  chosen: z.string().nullable().optional(),
  rationale: z.string().optional(),
  decidedBy: z.string().optional(),
}).passthrough();

export const insightAttributesSchema = z.object({
  sentiment: z.string().optional(),
  dataPoints: z.array(z.string()).optional(),
  feasibility: z.string().optional(),
}).passthrough();

/**
 * Discriminated union: validate attributes based on entity type.
 * Use this in the API layer when creating/updating entities.
 */
export const entityWithAttributesSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task"),
    attributes: taskAttributesSchema.optional(),
  }),
  z.object({
    type: z.literal("decision"),
    attributes: decisionAttributesSchema.optional(),
  }),
  z.object({
    type: z.literal("insight"),
    attributes: insightAttributesSchema.optional(),
  }),
]);

// ============================================================
// Hono integration example (Zod middleware)
// ============================================================

/*
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

app.post(
  "/api/entities",
  zValidator("json", entityInsertSchema),
  async (c) => {
    const data = c.req.valid("json");
    // data is fully typed and validated
    const result = await db.insert(entities).values(data).returning();
    return c.json(result[0], 201);
  }
);

app.post(
  "/api/notes",
  zValidator("json", rawNoteInsertSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await db.insert(rawNotes).values(data).returning();
    return c.json(result[0], 201);
  }
);
*/
