import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

import { extractionResultSchema } from "./schemas/extraction-schema.js";

const EXTRACTION_MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? "claude-sonnet-4-20250514";
export const EXTRACTION_PROMPT_VERSION = "v1";

// Few-shot examples from docs/extraction-prompts.md (Phase A).
const EXTRACTION_FEW_SHOT_EXAMPLES = `
## Few-Shot Examples

### Example 1: CLI Quick Capture

Raw Note:
Source: cli
Captured at: 2026-02-07T10:30:00Z
Source metadata: { "workingDirectory": "/Users/dev/myapp", "gitBranch": "main" }

Content:
the login page is broken on safari - shows blank white screen after clicking submit. Jake saw it first on his phone

Expected Extraction:
\`\`\`json
{
  "entities": [
    {
      "type": "task",
      "content": "Fix login page blank white screen on Safari after form submission",
      "status": "captured",
      "attributes": {
        "category": "bug_fix",
        "owner": "Jake",
        "priority": null,
        "complexity": null
      },
      "tags": ["login", "safari", "mobile", "bug"],
      "evidence": [
        {
          "quote": "the login page is broken on safari - shows blank white screen after clicking submit",
          "startOffset": 0,
          "endOffset": 82
        },
        {
          "quote": "Jake saw it first on his phone",
          "startOffset": 84,
          "endOffset": 114
        }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.95, "reason": "Clearly describes a bug: something is broken and needs fixing" },
        "content": { "confidence": 0.95, "reason": "The problem is explicitly described" },
        "status": { "confidence": 1.0, "reason": "New extraction, always captured" },
        "category": { "confidence": 0.95, "reason": "'broken' and 'blank white screen' clearly indicate a bug" },
        "owner": { "confidence": 0.4, "reason": "Jake discovered the bug but is not explicitly assigned to fix it" }
      },
      "confidence": 0.4
    }
  ],
  "relationships": []
}
\`\`\`

### Example 2: Slack Message

Raw Note:
Source: slack
Captured at: 2026-02-06T15:45:00Z
Source metadata: { "channelId": "C04ABC123", "channelName": "#product", "messageTs": "1738856700.000100", "userId": "U02XYZ789", "permalink": "https://myteam.slack.com/archives/C04ABC123/p1738856700000100" }

Content:
Hey team, after looking at the analytics this morning I think we should switch the onboarding flow from 5 steps to 3. Conversion drops 40% between step 3 and step 4. @maria can you take point on the redesign? We also need to decide whether to keep the progress bar or switch to a stepper component.

Expected Extraction:
\`\`\`json
{
  "entities": [
    {
      "type": "decision",
      "content": "Simplify onboarding flow from 5 steps to 3 steps",
      "status": "decided",
      "attributes": {
        "options": ["Keep 5-step flow", "Reduce to 3 steps"],
        "chosen": "Reduce to 3 steps",
        "rationale": "Conversion drops 40% between step 3 and step 4",
        "decidedBy": null
      },
      "tags": ["onboarding", "conversion", "ux"],
      "evidence": [
        { "quote": "I think we should switch the onboarding flow from 5 steps to 3", "startOffset": 48, "endOffset": 110 },
        { "quote": "Conversion drops 40% between step 3 and step 4", "startOffset": 112, "endOffset": 160 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.85, "reason": "'we should switch' indicates a decision, though phrased as suggestion" },
        "content": { "confidence": 0.95, "reason": "The change is explicitly described" },
        "status": { "confidence": 0.7, "reason": "'I think we should' is suggestive, not a final declaration -- could still be pending team agreement" },
        "chosen": { "confidence": 0.7, "reason": "Stated as a recommendation, not a confirmed final decision" },
        "rationale": { "confidence": 0.95, "reason": "Data point is explicitly stated" }
      },
      "confidence": 0.7
    },
    {
      "type": "task",
      "content": "Redesign onboarding flow (reduce from 5 steps to 3)",
      "status": "captured",
      "attributes": { "category": "feature", "owner": "maria", "priority": null, "complexity": null },
      "tags": ["onboarding", "redesign", "ux"],
      "evidence": [
        { "quote": "@maria can you take point on the redesign?", "startOffset": 162, "endOffset": 205 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.95, "reason": "Explicit request for someone to do work" },
        "content": { "confidence": 0.9, "reason": "Redesign is explicitly requested; scope inferred from the decision context" },
        "status": { "confidence": 1.0, "reason": "New extraction, always captured" },
        "category": { "confidence": 0.8, "reason": "Redesigning a flow is a feature/improvement, not a bug fix" },
        "owner": { "confidence": 0.85, "reason": "Directly asked '@maria' to 'take point', though phrased as a question" }
      },
      "confidence": 0.8
    },
    {
      "type": "decision",
      "content": "Choose between progress bar and stepper component for onboarding UI",
      "status": "pending",
      "attributes": { "options": ["Keep progress bar", "Switch to stepper component"], "chosen": null, "rationale": null, "decidedBy": null },
      "tags": ["onboarding", "ui-components"],
      "evidence": [
        { "quote": "We also need to decide whether to keep the progress bar or switch to a stepper component", "startOffset": 207, "endOffset": 296 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.95, "reason": "'need to decide' explicitly frames this as a decision" },
        "content": { "confidence": 0.95, "reason": "The two options are explicitly stated" },
        "status": { "confidence": 0.95, "reason": "'need to decide' clearly indicates this is unresolved" }
      },
      "confidence": 0.95
    }
  ],
  "relationships": [
    { "sourceIndex": 0, "targetIndex": 1, "relationshipType": "derived_from" },
    { "sourceIndex": 2, "targetIndex": 1, "relationshipType": "related_to" }
  ]
}
\`\`\`

### Example 3: Meeting Transcript Snippet

Raw Note:
Source: meeting_transcript
Captured at: 2026-02-05T14:00:00Z
Source metadata: { "meetingTitle": "Sprint Planning - Feb 5", "platform": "fireflies", "participants": ["Alex", "Priya", "Jordan", "Sam"], "durationMinutes": 45 }

Content:
Alex: OK so the API rate limiting is becoming a real problem. Three customers hit the 429 limit yesterday and two of them opened support tickets.

Priya: Yeah I saw those tickets. We talked about this last month and decided to go with a token bucket algorithm, but nobody picked it up.

Jordan: I can take it. Should be a medium-sized piece of work, maybe 3-4 days. I'll need to touch the gateway middleware and add Redis counters.

Alex: Perfect. Let's make it high priority. Sam, can you update the API docs to include rate limit headers once Jordan's done?

Sam: Sure, I'll add a section on the 429 response and the X-RateLimit headers.

Priya: One more thing -- I've been hearing from the sales team that customers want a usage dashboard. Not sure if that's in scope for this sprint but we should track it.

Expected Extraction:
\`\`\`json
{
  "entities": [
    {
      "type": "task",
      "content": "Implement token bucket rate limiting for API (gateway middleware + Redis counters)",
      "status": "captured",
      "attributes": { "category": "feature", "owner": "Jordan", "priority": "high", "complexity": "medium" },
      "tags": ["api", "rate-limiting", "infrastructure", "redis"],
      "evidence": [
        { "quote": "decided to go with a token bucket algorithm, but nobody picked it up", "startOffset": 248, "endOffset": 316 },
        { "quote": "Jordan: I can take it. Should be a medium-sized piece of work, maybe 3-4 days. I'll need to touch the gateway middleware and add Redis counters.", "startOffset": 318, "endOffset": 463 },
        { "quote": "Let's make it high priority", "startOffset": 473, "endOffset": 500 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.95, "reason": "Clear work item with explicit assignment" },
        "content": { "confidence": 0.95, "reason": "Algorithm choice, scope, and implementation details all stated" },
        "status": { "confidence": 1.0, "reason": "New extraction, always captured" },
        "category": { "confidence": 0.85, "reason": "New capability (rate limiting), though could be 'improvement'" },
        "owner": { "confidence": 0.95, "reason": "Jordan explicitly volunteers: 'I can take it'" },
        "priority": { "confidence": 0.95, "reason": "Alex explicitly says 'Let's make it high priority'" },
        "complexity": { "confidence": 0.85, "reason": "Jordan says 'medium-sized piece of work, maybe 3-4 days'" }
      },
      "confidence": 0.85
    },
    {
      "type": "task",
      "content": "Update API docs with rate limit headers (429 response, X-RateLimit headers)",
      "status": "captured",
      "attributes": { "category": "chore", "owner": "Sam", "priority": null, "complexity": "small" },
      "tags": ["api", "documentation", "rate-limiting"],
      "evidence": [
        { "quote": "Sam, can you update the API docs to include rate limit headers once Jordan's done?", "startOffset": 502, "endOffset": 585 },
        { "quote": "Sam: Sure, I'll add a section on the 429 response and the X-RateLimit headers.", "startOffset": 587, "endOffset": 666 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.95, "reason": "Explicit documentation work assigned to Sam" },
        "content": { "confidence": 0.95, "reason": "Exact scope stated: 429 response and X-RateLimit headers" },
        "status": { "confidence": 1.0, "reason": "New extraction, always captured" },
        "category": { "confidence": 0.8, "reason": "Documentation update is a chore, not a feature" },
        "owner": { "confidence": 0.95, "reason": "Sam is directly asked and confirms" },
        "complexity": { "confidence": 0.75, "reason": "Adding a docs section is typically small, but not explicitly sized" }
      },
      "confidence": 0.75
    },
    {
      "type": "insight",
      "content": "Customers want a usage dashboard for API consumption",
      "status": "captured",
      "attributes": {
        "sentiment": "neutral",
        "dataPoints": ["Sales team is hearing customer requests for a usage dashboard"],
        "feasibility": "Not scoped for current sprint; needs further investigation"
      },
      "tags": ["api", "dashboard", "customer-feedback"],
      "evidence": [
        { "quote": "I've been hearing from the sales team that customers want a usage dashboard. Not sure if that's in scope for this sprint but we should track it.", "startOffset": 684, "endOffset": 828 }
      ],
      "fieldConfidence": {
        "type": { "confidence": 0.85, "reason": "Priya frames this as something to 'track', not an immediate action item -- insight rather than task" },
        "content": { "confidence": 0.9, "reason": "The customer desire is clearly stated" },
        "status": { "confidence": 1.0, "reason": "New extraction, always captured" },
        "sentiment": { "confidence": 0.8, "reason": "Customer request is informational, not positive or negative" }
      },
      "confidence": 0.8
    }
  ],
  "relationships": [
    { "sourceIndex": 0, "targetIndex": 1, "relationshipType": "related_to" }
  ]
}
\`\`\`
`.trim();

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
${EXTRACTION_FEW_SHOT_EXAMPLES}
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

  const call = async (message: string) => {
    return getClient().messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      tools: [
        {
          name: "extract_entities",
          description: "Extract structured entities from the raw note. Call this tool exactly once.",
          input_schema: zodToJsonSchema(extractionResultSchema as any) as any,
        },
      ],
      tool_choice: { type: "tool", name: "extract_entities" },
    } as any);
  };

  const extractedAt = new Date().toISOString();
  let lastResponse: any = await call(userMessage);

  const toolUseBlock = (lastResponse as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "extract_entities");
  if (!toolUseBlock) throw new Error("No tool_use block in extraction response");

  let parsed = extractionResultSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    // Retry once with validation issues appended.
    const retryMsg = [
      userMessage,
      ``,
      `## Validation Issues`,
      `The previous tool output did not match the schema. Fix the output and call extract_entities again.`,
      "```json",
      JSON.stringify(parsed.error.issues, null, 2),
      "```",
    ].join("\n");

    lastResponse = await call(retryMsg);
    const retryToolUse = (lastResponse as any).content?.find((b: any) => b?.type === "tool_use" && b?.name === "extract_entities");
    if (!retryToolUse) throw new Error("No tool_use block in extraction retry response");
    parsed = extractionResultSchema.safeParse(retryToolUse.input);
  }

  if (!parsed.success) {
    const err = new Error("Extraction output failed Zod validation");
    (err as any).issues = parsed.error.issues;
    throw err;
  }

  const usage = lastResponse?.usage ?? null;
  const tokenUsage = usage
    ? {
        input: usage.input_tokens,
        output: usage.output_tokens,
      }
    : undefined;

  return { result: parsed.data, model: EXTRACTION_MODEL, promptVersion: EXTRACTION_PROMPT_VERSION, tokenUsage, extractedAt };
}
