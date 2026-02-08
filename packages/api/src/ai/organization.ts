import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { organizationResultSchema } from "./schemas/organization-schema.js";

const ORGANIZATION_MODEL = process.env.ANTHROPIC_ORGANIZATION_MODEL ?? "claude-sonnet-4-20250514";
export const ORGANIZATION_PROMPT_VERSION = "v1";

// Few-shot example from docs/extraction-prompts.md (Phase B).
const ORGANIZATION_FEW_SHOT_EXAMPLE = `
## Few-Shot Example

Input Extracted Entities:
\`\`\`json
[
  {
    "type": "task",
    "content": "Implement token bucket rate limiting for API (gateway middleware + Redis counters)",
    "status": "captured",
    "attributes": { "category": "feature", "owner": "Jordan", "priority": "high", "complexity": "medium" },
    "tags": ["api", "rate-limiting", "infrastructure", "redis"]
  },
  {
    "type": "task",
    "content": "Update API docs with rate limit headers (429 response, X-RateLimit headers)",
    "status": "captured",
    "attributes": { "category": "chore", "owner": "Sam" },
    "tags": ["api", "documentation", "rate-limiting"]
  },
  {
    "type": "insight",
    "content": "Customers want a usage dashboard for API consumption",
    "status": "captured",
    "attributes": { "sentiment": "neutral", "dataPoints": ["Sales team hearing customer requests"] },
    "tags": ["api", "dashboard", "customer-feedback"]
  }
]
\`\`\`

Input Active Projects:
\`\`\`json
[
  {
    "id": "proj-001",
    "name": "Platform API",
    "description": "Core API platform: authentication, rate limiting, versioning, and developer experience",
    "epics": [
      { "id": "epic-010", "name": "Rate Limiting", "description": "Implement and configure API rate limiting across all endpoints" },
      { "id": "epic-011", "name": "API Documentation", "description": "Developer-facing API docs, examples, and changelog" },
      { "id": "epic-012", "name": "Authentication", "description": "API key management, OAuth, and token validation" }
    ]
  },
  {
    "id": "proj-002",
    "name": "Customer Portal",
    "description": "Self-service portal for customers: billing, usage analytics, team management",
    "epics": [
      { "id": "epic-020", "name": "Usage Analytics", "description": "Dashboard showing API usage, costs, and trends" }
    ]
  }
]
\`\`\`

Input Recent Entities:
\`\`\`json
[
  {
    "id": "ent-existing-001",
    "type": "task",
    "content": "Add rate limiting to public API endpoints",
    "tags": ["api", "rate-limiting"],
    "projectId": "proj-001"
  },
  {
    "id": "ent-existing-002",
    "type": "task",
    "content": "Set up Redis cluster for caching",
    "tags": ["infrastructure", "redis"],
    "projectId": "proj-001"
  }
]
\`\`\`

Input Known Users:
\`\`\`json
[
  { "id": "user-001", "name": "Jordan Chen", "email": "jordan@company.com" },
  { "id": "user-002", "name": "Sam Patel", "email": "sam@company.com" },
  { "id": "user-003", "name": "Maria Garcia", "email": "maria@company.com" },
  { "id": "user-004", "name": "Alex Kim", "email": "alex@company.com" }
]
\`\`\`

Expected Output:
\`\`\`json
{
  "entityOrganizations": [
    {
      "entityIndex": 0,
      "projectId": "proj-001",
      "projectConfidence": 0.95,
      "projectReason": "Entity tags include 'api' and 'rate-limiting', which match the Platform API project description and the Rate Limiting epic",
      "epicId": "epic-010",
      "epicConfidence": 0.95,
      "epicReason": "The 'Rate Limiting' epic directly describes this work: 'Implement and configure API rate limiting across all endpoints'",
      "duplicateCandidates": [
        {
          "entityId": "ent-existing-001",
          "similarityScore": 0.8,
          "reason": "Both describe implementing rate limiting on the API. The existing entity is more generic while the new one specifies algorithm and implementation details."
        }
      ],
      "assigneeId": "user-001",
      "assigneeConfidence": 0.9,
      "assigneeReason": "Owner string 'Jordan' matches 'Jordan Chen' (first name match)"
    },
    {
      "entityIndex": 1,
      "projectId": "proj-001",
      "projectConfidence": 0.95,
      "projectReason": "API documentation is part of the Platform API project",
      "epicId": "epic-011",
      "epicConfidence": 0.9,
      "epicReason": "The 'API Documentation' epic covers developer-facing API docs, and this task adds rate limit header documentation",
      "duplicateCandidates": [],
      "assigneeId": "user-002",
      "assigneeConfidence": 0.9,
      "assigneeReason": "Owner string 'Sam' matches 'Sam Patel' (first name match)"
    },
    {
      "entityIndex": 2,
      "projectId": "proj-002",
      "projectConfidence": 0.7,
      "projectReason": "The usage dashboard request aligns better with Customer Portal than Platform API, but is somewhat ambiguous.",
      "epicId": "epic-020",
      "epicConfidence": 0.65,
      "epicReason": "The 'Usage Analytics' epic describes a dashboard showing API usage; lower confidence because the insight is vague.",
      "duplicateCandidates": [],
      "assigneeId": null,
      "assigneeConfidence": null,
      "assigneeReason": null
    }
  ],
  "epicSuggestions": [],
  "projectSuggestions": []
}
\`\`\`
`.trim();

const ORGANIZATION_SYSTEM_PROMPT = `
You are an organization system for a project management tool. You receive entities that were just extracted from raw notes, along with a list of active projects and their epics. Your job is to route each entity to the correct project and epic.

## Your Inputs

1. Extracted entities: an array of entities (from Phase A extraction), each with type, content, attributes, tags, and evidence.
2. Active projects: a list of projects with their names, descriptions, and epics.
3. Recent entities: a sample of recently created entities per project (for duplicate detection context).
4. Known users: a list of team members (for assignee resolution).

## Your Tasks

For each extracted entity, determine:

1. Project assignment: choose a projectId or null if no clear match.
2. Epic assignment: choose an epicId within that project or null if no match.
3. Duplicate detection: candidate duplicate entity IDs with similarity scores (only include above 0.7).
4. Assignee resolution: resolve attributes.owner string to a known user ID or null.
5. Epic suggestions (optional): if you see a cluster of entities that should become a new epic, suggest:
   - projectId, name, description
   - entityIndices (0-based indices into the extractedEntities array)
   - confidence (0.0-1.0) and reason
6. Project suggestions (optional): if entities describe a new initiative, product, or work area
   that doesn't match ANY existing project, suggest creating a project:
   - name, description
   - entityIndices (0-based indices into the extractedEntities array)
   - confidence (0.0-1.0) and reason
   Only suggest when you are confident these entities represent a genuinely distinct project,
   not just a new epic within an existing project.

## Confidence

Provide confidence scores (0.0-1.0) for project, epic, duplicates, and assignee. Items with any confidence below 0.9 will be routed to the review queue.

## Output

Call the organize_entities tool with the structured output. Do not produce any other text.
${ORGANIZATION_FEW_SHOT_EXAMPLE}
`.trim();

let client: Anthropic | null = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  client = new Anthropic({ apiKey });
  return client;
}

export type ProjectContext = {
  id: string;
  name: string;
  description: string | null;
  epics: { id: string; name: string; description: string | null }[];
};

export type RecentEntity = {
  id: string;
  type: string;
  content: string;
  tags: string[];
  projectId: string | null;
};

export type KnownUser = {
  id: string;
  name: string;
  email: string;
};

export async function organizeEntities(opts: {
  extractedEntities: unknown[];
  projects: ProjectContext[];
  recentEntities: RecentEntity[];
  knownUsers: KnownUser[];
  rawNoteSource: string;
  sourceMeta?: Record<string, unknown>;
}) {
  const userMessage = [
    `## Extracted Entities`,
    "```json",
    JSON.stringify(opts.extractedEntities, null, 2),
    "```",
    ``,
    `## Active Projects`,
    "```json",
    JSON.stringify(opts.projects, null, 2),
    "```",
    ``,
    `## Recent Entities (for duplicate detection)`,
    "```json",
    JSON.stringify(opts.recentEntities, null, 2),
    "```",
    ``,
    `## Known Users`,
    "```json",
    JSON.stringify(opts.knownUsers, null, 2),
    "```",
    ``,
    `## Source Context`,
    `- Source: ${opts.rawNoteSource}`,
    opts.sourceMeta ? `- Source metadata: ${JSON.stringify(opts.sourceMeta)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const call = async (message: string) => {
    return getClient().messages.create({
      model: ORGANIZATION_MODEL,
      max_tokens: 4096,
      system: ORGANIZATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      tools: [
        {
          name: "organize_entities",
          description: "Assign extracted entities to projects, epics, and detect duplicates. Call this tool exactly once.",
          input_schema: (() => { const { $schema, ...rest } = z.toJSONSchema(organizationResultSchema); return rest; })() as any,
        },
      ],
      tool_choice: { type: "tool", name: "organize_entities" },
    } as any);
  };

  let lastResponse: any = await call(userMessage);
  const toolUseBlock = (lastResponse as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "organize_entities");
  if (!toolUseBlock) throw new Error("No tool_use block in organization response");

  let parsed = organizationResultSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    const retryMsg = [
      userMessage,
      ``,
      `## Validation Issues`,
      `The previous tool output did not match the schema. Fix the output and call organize_entities again.`,
      "```json",
      JSON.stringify(parsed.error.issues, null, 2),
      "```",
    ].join("\n");

    lastResponse = await call(retryMsg);
    const retryToolUse = (lastResponse as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "organize_entities");
    if (!retryToolUse) throw new Error("No tool_use block in organization retry response");
    parsed = organizationResultSchema.safeParse(retryToolUse.input);
  }

  if (!parsed.success) {
    const err = new Error("Organization output failed Zod validation");
    (err as any).issues = parsed.error.issues;
    throw err;
  }

  return { result: parsed.data, model: ORGANIZATION_MODEL, promptVersion: ORGANIZATION_PROMPT_VERSION };
}
