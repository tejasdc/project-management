import { z } from "zod";

const duplicateCandidateSchema = z.object({
  entityId: z.string().uuid(),
  similarityScore: z.number().min(0.7).max(1.0),
  reason: z.string(),
});

const entityOrganizationSchema = z.object({
  entityIndex: z.number().int().nonnegative(),

  projectId: z.string().uuid().nullable(),
  projectConfidence: z.number().min(0).max(1),
  projectReason: z.string(),

  epicId: z.string().uuid().nullable(),
  epicConfidence: z.number().min(0).max(1),
  epicReason: z.string(),

  duplicateCandidates: z.array(duplicateCandidateSchema).default([]),

  assigneeId: z.string().uuid().nullable(),
  assigneeConfidence: z.number().min(0).max(1).nullable(),
  assigneeReason: z.string().nullable(),
});

const epicSuggestionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  projectId: z.string().uuid(),
  entityIndices: z.array(z.number().int().nonnegative()).default([]),
  confidence: z.number().min(0).max(1).default(0.85),
  reason: z.string(),
});

export const organizationResultSchema = z.object({
  entityOrganizations: z.array(entityOrganizationSchema).default([]),
  epicSuggestions: z.array(epicSuggestionSchema).default([]),
});

export type OrganizationResult = z.infer<typeof organizationResultSchema>;
