import { z } from "zod";
import { ENTITY_TYPES, NOTE_SOURCES, REVIEW_STATUSES } from "./constants.js";

// ============================================================
// JSONB attribute schemas
// ============================================================

export const taskAttributesSchema = z
  .object({
    category: z
      .enum(["feature", "bug_fix", "improvement", "chore", "refactor", "story"])
      .optional(),
    owner: z.string().optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    complexity: z.enum(["small", "medium", "large"]).optional(),
  })
  .passthrough();

export const decisionAttributesSchema = z
  .object({
    options: z.array(z.string()).optional(),
    chosen: z.string().nullable().optional(),
    rationale: z.string().optional(),
    decidedBy: z.string().optional(),
  })
  .passthrough();

export const insightAttributesSchema = z
  .object({
    sentiment: z.string().optional(),
    dataPoints: z.array(z.string()).optional(),
    feasibility: z.string().optional(),
  })
  .passthrough();

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
// Capture note schema
// ============================================================

export const captureNoteSchema = z.object({
  content: z.string().min(1, "Content cannot be empty"),
  source: z.enum(NOTE_SOURCES),
  sourceMeta: z.record(z.string(), z.unknown()).optional(),
  capturedAt: z.string().datetime().optional(),
  externalId: z.string().optional(),
});

// ============================================================
// Review resolve schema
// ============================================================

export const reviewResolveSchema = z.object({
  status: z.enum(["accepted", "rejected", "modified"] as const),
  userResolution: z
    .object({
      suggestedType: z.enum(ENTITY_TYPES).optional(),
      suggestedProjectId: z.string().optional(),
      suggestedProjectName: z.string().optional(),
      suggestedEpicId: z.string().optional(),
      suggestedEpicName: z.string().optional(),
      proposedEpicName: z.string().optional(),
      proposedEpicDescription: z.string().nullable().optional(),
      proposedEpicProjectId: z.string().optional(),
      duplicateEntityId: z.string().optional(),
      similarityScore: z.number().optional(),
      suggestedAssigneeId: z.string().optional(),
      suggestedAssigneeName: z.string().optional(),
      explanation: z.string().optional(),
    })
    .passthrough()
    .optional(),
  trainingComment: z.string().optional(),
});
