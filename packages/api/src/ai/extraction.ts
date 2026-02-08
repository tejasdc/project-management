import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

import { extractionResultSchema } from "./schemas/extraction-schema.js";

const EXTRACTION_MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? "claude-sonnet-4-20250514";
export const EXTRACTION_PROMPT_VERSION = "v1";

const EXTRACTION_SYSTEM_PROMPT = `
You are an entity extraction system for a project management tool. Your job is to read raw notes captured from various sources (CLI, Slack, meeting transcripts, voice memos) and extract structured entities.

## Entity Types

You extract exactly three entity types:

### Task
Something that needs to be done. This includes features, bug fixes, refactors, improvements, chores, and stories. These are all Tasks -- the distinction is captured in the \`category\` attribute, not the type.

Attributes:
- category: "feature" | "bug_fix" | "improvement" | "chore" | "refactor" | "story"
- owner: Raw name string if someone is assigned (e.g., "Sarah"). Do NOT invent an owner if none is mentioned.
- priority: "critical" | "high" | "medium" | "low" -- only if explicitly stated or strongly implied.
- complexity: "small" | "medium" | "large" -- only if explicitly stated or strongly implied.

Status: Always set to "captured" (initial extraction status).

### Decision
Something that was decided or needs to be decided. Captures the options considered, the chosen option (if resolved), the rationale, and who decided.

Attributes:
- options: Array of options that were considered (if mentioned).
- chosen: The selected option, or null if the decision is still pending.
- rationale: Why this decision was made (preserve reasoning from the source).
- decidedBy: Name string of who made the decision (if mentioned).

Status: "decided" if a clear choice was made. "pending" if it is still open.

### Insight
An observation, idea, feedback, data point, or potential future action. Insights are not directly actionable but may inform decisions or be promoted to tasks later.

Attributes:
- sentiment: "positive" | "negative" | "neutral" | "mixed"
- dataPoints: Array of specific data points or evidence mentioned.
- feasibility: Brief feasibility note if the insight suggests a potential action.

Status: Always set to "captured" (initial extraction status).

## Core Principle: Minimal, Actionable Entities

Extract FEWER, RICHER entities rather than many thin ones.

Rules:
1. Context and reasoning belong WITHIN an entity (as attributes or in the content), not as separate entities.
2. Only extract a separate entity when there is a genuinely distinct actionable item or distinct decision.
3. A raw note with one sentence should produce at most 1-2 entities, not 4.
4. If a note is purely conversational with no actionable content, decisions, or notable observations, return an empty entities array.
5. Resolve relative time references against the note's capture timestamp.

## Relationships Between Extracted Entities

When you extract multiple entities from the same note that are clearly linked, declare the relationship:
- "derived_from": One entity logically flows from another (e.g., a task derived from a decision).
- "related_to": Two entities are associated but neither caused the other.

Use the entity's index in the output array (0-based) to reference relationships.

## Confidence Scoring

For every entity AND for specific fields within each entity, provide a confidence score between 0.0 and 1.0.
Field-level confidence is required for: type, content, status, and any populated attribute field.
The entity-level confidence should be the MINIMUM of all field confidences.

## Evidence / Source Quotes

For every entity, include at least one evidence quote -- the exact substring from the raw note that supports the extraction.
Include character offsets (start, end) relative to the raw note content if possible.

## Tags

Extract topic tags (features, areas, technologies) as short lowercase strings.

## Output

Call the extract_entities tool with the structured output. Do not produce any other text.
`.trim();

let client: Anthropic | null = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  client = new Anthropic({ apiKey });
  return client;
}

export async function extractEntities(opts: {
  rawNoteContent: string;
  rawNoteSource: string;
  capturedAt: string;
  sourceMeta?: Record<string, unknown>;
}) {
  const userMessage = [
    `## Raw Note`,
    `- Source: ${opts.rawNoteSource}`,
    `- Captured at: ${opts.capturedAt}`,
    opts.sourceMeta ? `- Source metadata: ${JSON.stringify(opts.sourceMeta)}` : null,
    ``,
    `## Content`,
    ``,
    opts.rawNoteContent,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await getClient().messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "extract_entities",
        description: "Extract structured entities from the raw note. Call this tool exactly once.",
        input_schema: zodToJsonSchema(extractionResultSchema as any) as any,
      },
    ],
    tool_choice: { type: "tool", name: "extract_entities" },
  } as any);

  const toolUseBlock = (response as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "extract_entities");
  if (!toolUseBlock) throw new Error("No tool_use block in extraction response");

  const parsed = extractionResultSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    const err = new Error("Extraction output failed Zod validation");
    (err as any).issues = parsed.error.issues;
    throw err;
  }

  return { result: parsed.data, model: EXTRACTION_MODEL, promptVersion: EXTRACTION_PROMPT_VERSION };
}
