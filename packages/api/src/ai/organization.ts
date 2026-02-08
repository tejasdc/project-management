import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

import { organizationResultSchema } from "./schemas/organization-schema.js";

const ORGANIZATION_MODEL = process.env.ANTHROPIC_ORGANIZATION_MODEL ?? "claude-sonnet-4-20250514";
export const ORGANIZATION_PROMPT_VERSION = "v1";

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

## Confidence

Provide confidence scores (0.0-1.0) for project, epic, duplicates, and assignee. Items with any confidence below 0.9 will be routed to the review queue.

## Output

Call the organize_entities tool with the structured output. Do not produce any other text.
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

  const response = await getClient().messages.create({
    model: ORGANIZATION_MODEL,
    max_tokens: 4096,
    system: ORGANIZATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "organize_entities",
        description: "Assign extracted entities to projects, epics, and detect duplicates. Call this tool exactly once.",
        input_schema: zodToJsonSchema(organizationResultSchema as any) as any,
      },
    ],
    tool_choice: { type: "tool", name: "organize_entities" },
  } as any);

  const toolUseBlock = (response as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "organize_entities");
  if (!toolUseBlock) throw new Error("No tool_use block in organization response");

  const parsed = organizationResultSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    const err = new Error("Organization output failed Zod validation");
    (err as any).issues = parsed.error.issues;
    throw err;
  }

  return { result: parsed.data, model: ORGANIZATION_MODEL, promptVersion: ORGANIZATION_PROMPT_VERSION };
}
