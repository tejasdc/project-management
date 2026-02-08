import { z } from "zod";

const evidenceSchema = z.object({
  quote: z.string(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});

const fieldConfidenceSchema = z.object({
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

const nullableEnum = <T extends [string, ...string[]]>(values: T) =>
  z.enum(values).nullable().optional();

const taskAttributesSchema = z
  .object({
    category: nullableEnum(["feature", "bug_fix", "improvement", "chore", "refactor", "story"]),
    owner: z.string().nullable().optional(),
    priority: nullableEnum(["critical", "high", "medium", "low"]),
    complexity: nullableEnum(["small", "medium", "large"]),
  })
  .passthrough();

const decisionAttributesSchema = z
  .object({
    options: z.array(z.string()).optional(),
    chosen: z.string().nullable().optional(),
    rationale: z.string().nullable().optional(),
    decidedBy: z.string().nullable().optional(),
  })
  .passthrough();

const insightAttributesSchema = z
  .object({
    sentiment: z.string().nullable().optional(),
    dataPoints: z.array(z.string()).optional(),
    feasibility: z.string().nullable().optional(),
  })
  .passthrough();

const extractedEntityBaseSchema = z.object({
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  evidence: z.array(evidenceSchema).min(1),
  fieldConfidence: z.record(z.string(), fieldConfidenceSchema).default({}),
  confidence: z.number().min(0).max(1),
});

const extractedTaskSchema = extractedEntityBaseSchema.extend({
  type: z.literal("task"),
  status: z.literal("captured"),
  attributes: taskAttributesSchema.optional().default({}),
});

const extractedDecisionSchema = extractedEntityBaseSchema.extend({
  type: z.literal("decision"),
  status: z.enum(["pending", "decided"]),
  attributes: decisionAttributesSchema.optional().default({}),
});

const extractedInsightSchema = extractedEntityBaseSchema.extend({
  type: z.literal("insight"),
  status: z.literal("captured"),
  attributes: insightAttributesSchema.optional().default({}),
});

export const extractedEntitySchema = z.discriminatedUnion("type", [
  extractedTaskSchema,
  extractedDecisionSchema,
  extractedInsightSchema,
]);

export const extractedRelationshipSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  targetIndex: z.number().int().nonnegative(),
  relationshipType: z.enum(["derived_from", "related_to"]),
});

export const extractionResultSchema = z.object({
  entities: z.array(extractedEntitySchema),
  relationships: z.array(extractedRelationshipSchema).default([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
