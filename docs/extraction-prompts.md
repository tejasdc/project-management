# AI Extraction Pipeline: Sample Prompts

Companion document to [`project-management-agent.md`](./project-management-agent.md) and [`database-schema.md`](./database-schema.md).

This document defines the prompts, Zod schemas, and few-shot examples for both phases of the AI entity extraction pipeline. These are design references for the Phase 1 (TypeScript + Claude API `tool_use`) implementation.

---

## Table of Contents

1. [Phase A -- Entity Extraction Prompt](#phase-a--entity-extraction-prompt)
   - [System Prompt](#phase-a-system-prompt)
   - [Zod Schema (Structured Output)](#phase-a-zod-schema)
   - [Claude API tool_use Format](#phase-a-claude-api-tool_use-format)
   - [Few-Shot Examples](#phase-a-few-shot-examples)
   - [Confidence Scoring](#confidence-scoring)
   - [Evidence Capture](#evidence-capture)
2. [Phase B -- Organization Prompt](#phase-b--organization-prompt)
   - [System Prompt](#phase-b-system-prompt)
   - [Zod Schema (Structured Output)](#phase-b-zod-schema)
   - [Claude API tool_use Format](#phase-b-claude-api-tool_use-format)
   - [Few-Shot Example](#phase-b-few-shot-example)

---

## Phase A -- Entity Extraction Prompt

Phase A takes raw note content and extracts typed entities (Task, Decision, Insight) with attributes, confidence scores, and source evidence.

### Phase A System Prompt

```
You are an entity extraction system for a project management tool. Your job is to read raw notes captured from various sources (CLI, Slack, meeting transcripts, voice memos) and extract structured entities.

## Entity Types

You extract exactly three entity types:

### Task
Something that needs to be done. This includes features, bug fixes, refactors, improvements, chores, and stories. These are all Tasks -- the distinction is captured in the `category` attribute, not the type.

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
1. Context and reasoning belong WITHIN an entity (as attributes or in the content), not as separate entities. If "3 users dropped off at step 2" is context for a decision to simplify onboarding, it goes into the decision's rationale -- not as a separate insight.
2. Only extract a separate entity when there is a genuinely distinct actionable item or distinct decision.
3. A raw note with one sentence should produce at most 1-2 entities, not 4.
4. If a note is purely conversational with no actionable content, decisions, or notable observations, return an empty entities array.
5. Resolve relative time references against the note's capture timestamp. "Next week" in a note captured on 2026-02-01 means the week of 2026-02-08.

## Relationships Between Extracted Entities

When you extract multiple entities from the same note that are clearly linked, declare the relationship:
- "derived_from": One entity logically flows from another (e.g., a task derived from a decision).
- "related_to": Two entities are associated but neither caused the other.

Use the entity's index in the output array (0-based) to reference relationships.

## Confidence Scoring

For every entity AND for specific fields within each entity, provide a confidence score between 0.0 and 1.0:

- 1.0: Explicitly stated in the source text. No interpretation needed.
- 0.8-0.9: Strongly implied. Very little ambiguity.
- 0.6-0.7: Reasonable inference, but the source is somewhat ambiguous.
- 0.4-0.5: Guess based on weak signals. Likely needs human review.
- Below 0.4: Very uncertain. Flag for review.

Field-level confidence is required for: type, content, status, and any populated attribute field. The entity-level confidence is the MINIMUM of all field confidences.

## Evidence / Source Quotes

For every entity, include at least one evidence quote -- the exact substring from the raw note that supports the extraction. Include character offsets (start, end) relative to the raw note content if possible. This prevents hallucination by anchoring every entity to source text.

## Tags

Extract topic tags (features, areas, technologies) as short lowercase strings. These map to the `about[]` field on entities. Examples: "onboarding", "authentication", "performance", "mobile".

## Output

Call the `extract_entities` tool with the structured output. Do not produce any other text.
```

### Phase A Zod Schema

This Zod schema defines the structured output expected from the Claude API `tool_use` call. It maps directly to the TypeScript types from the database schema (`TaskAttributes`, `DecisionAttributes`, `InsightAttributes`, `EntityAiMeta`, `EntityEvidence`).

```typescript
import { z } from "zod";

// ============================================================
// Evidence: anchors each entity to source text
// Maps to: EntityEvidence from database-schema.md types.ts
// ============================================================
const evidenceSchema = z.object({
  /** Exact quote from the raw note that supports this entity. */
  quote: z.string().describe("Exact substring from the raw note content"),
  /** Character offset where the quote starts in the raw note. */
  startOffset: z.number().int().nonnegative().optional()
    .describe("0-based start character offset in the raw note"),
  /** Character offset where the quote ends in the raw note. */
  endOffset: z.number().int().nonnegative().optional()
    .describe("0-based end character offset in the raw note"),
});

// ============================================================
// Field-level confidence
// Maps to: FieldConfidence from database-schema.md types.ts
// ============================================================
const fieldConfidenceSchema = z.object({
  confidence: z.number().min(0).max(1)
    .describe("0.0 to 1.0 confidence score"),
  reason: z.string().optional()
    .describe("Why this confidence level was assigned"),
});

// ============================================================
// Type-specific attributes
// Maps to: TaskAttributes, DecisionAttributes, InsightAttributes
// ============================================================
const taskAttributesSchema = z.object({
  category: z.enum([
    "feature", "bug_fix", "improvement", "chore", "refactor", "story",
  ]).optional()
    .describe("What kind of task this is"),
  owner: z.string().optional()
    .describe("Raw name string of who is assigned, e.g. 'Sarah'"),
  priority: z.enum(["critical", "high", "medium", "low"]).optional()
    .describe("Only if explicitly stated or strongly implied"),
  complexity: z.enum(["small", "medium", "large"]).optional()
    .describe("Only if explicitly stated or strongly implied"),
});

const decisionAttributesSchema = z.object({
  options: z.array(z.string()).optional()
    .describe("Options that were considered"),
  chosen: z.string().nullable().optional()
    .describe("The selected option, or null if still pending"),
  rationale: z.string().optional()
    .describe("Why this decision was made"),
  decidedBy: z.string().optional()
    .describe("Name string of who made the decision"),
});

const insightAttributesSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).optional()
    .describe("Overall sentiment of the observation"),
  dataPoints: z.array(z.string()).optional()
    .describe("Specific data points or evidence mentioned"),
  feasibility: z.string().optional()
    .describe("Brief feasibility note if the insight suggests an action"),
});

// ============================================================
// Extracted entity (discriminated union on type)
// ============================================================
const extractedTaskSchema = z.object({
  type: z.literal("task"),
  content: z.string()
    .describe("Concise description of what needs to be done"),
  status: z.literal("captured"),
  attributes: taskAttributesSchema,
  tags: z.array(z.string())
    .describe("Topic tags: features, areas, technologies"),
  evidence: z.array(evidenceSchema).min(1)
    .describe("Source quotes anchoring this entity to the raw note"),
  fieldConfidence: z.object({
    type: fieldConfidenceSchema,
    content: fieldConfidenceSchema,
    status: fieldConfidenceSchema,
    category: fieldConfidenceSchema.optional(),
    owner: fieldConfidenceSchema.optional(),
    priority: fieldConfidenceSchema.optional(),
    complexity: fieldConfidenceSchema.optional(),
  }).describe("Per-field confidence scores"),
  confidence: z.number().min(0).max(1)
    .describe("Entity-level confidence: minimum of all field confidences"),
});

const extractedDecisionSchema = z.object({
  type: z.literal("decision"),
  content: z.string()
    .describe("What was decided or needs to be decided"),
  status: z.enum(["pending", "decided"]),
  attributes: decisionAttributesSchema,
  tags: z.array(z.string()),
  evidence: z.array(evidenceSchema).min(1),
  fieldConfidence: z.object({
    type: fieldConfidenceSchema,
    content: fieldConfidenceSchema,
    status: fieldConfidenceSchema,
    chosen: fieldConfidenceSchema.optional(),
    rationale: fieldConfidenceSchema.optional(),
    decidedBy: fieldConfidenceSchema.optional(),
  }),
  confidence: z.number().min(0).max(1),
});

const extractedInsightSchema = z.object({
  type: z.literal("insight"),
  content: z.string()
    .describe("The observation, idea, or data point"),
  status: z.literal("captured"),
  attributes: insightAttributesSchema,
  tags: z.array(z.string()),
  evidence: z.array(evidenceSchema).min(1),
  fieldConfidence: z.object({
    type: fieldConfidenceSchema,
    content: fieldConfidenceSchema,
    status: fieldConfidenceSchema,
    sentiment: fieldConfidenceSchema.optional(),
    dataPoints: fieldConfidenceSchema.optional(),
    feasibility: fieldConfidenceSchema.optional(),
  }),
  confidence: z.number().min(0).max(1),
});

const extractedEntitySchema = z.discriminatedUnion("type", [
  extractedTaskSchema,
  extractedDecisionSchema,
  extractedInsightSchema,
]);

// ============================================================
// Relationship between extracted entities (intra-note)
// ============================================================
const extractedRelationshipSchema = z.object({
  sourceIndex: z.number().int().nonnegative()
    .describe("Index of the source entity in the entities array"),
  targetIndex: z.number().int().nonnegative()
    .describe("Index of the target entity in the entities array"),
  relationshipType: z.enum(["derived_from", "related_to"])
    .describe("How these entities are related"),
});

// ============================================================
// Top-level extraction result
// ============================================================
export const extractionResultSchema = z.object({
  entities: z.array(extractedEntitySchema)
    .describe("Extracted entities. Empty array if no actionable content."),
  relationships: z.array(extractedRelationshipSchema)
    .describe("Relationships between extracted entities in this note"),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
```

### Phase A Claude API tool_use Format

The extraction prompt is invoked via the Claude API using `tool_use` for structured output. The tool definition wraps the Zod schema above as a JSON Schema.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { extractionResultSchema } from "./schemas";

const EXTRACTION_SYSTEM_PROMPT = `...`; // The system prompt from above

async function extractEntities(
  client: Anthropic,
  rawNoteContent: string,
  rawNoteSource: string,
  capturedAt: string,
  sourceMeta?: Record<string, unknown>,
) {
  const userMessage = [
    `## Raw Note`,
    `- Source: ${rawNoteSource}`,
    `- Captured at: ${capturedAt}`,
    sourceMeta
      ? `- Source metadata: ${JSON.stringify(sourceMeta)}`
      : null,
    ``,
    `## Content`,
    ``,
    rawNoteContent,
  ].filter(Boolean).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "extract_entities",
        description:
          "Extract structured entities from the raw note. " +
          "Call this tool exactly once with the extraction result.",
        input_schema: zodToJsonSchema(
          extractionResultSchema
        ) as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: "extract_entities" },
  });

  // Parse the tool call result
  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use"
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("No tool_use block in response");
  }

  // Validate with Zod (runtime type safety)
  const parsed = extractionResultSchema.safeParse(toolUseBlock.input);

  if (!parsed.success) {
    // Retry once with validation error feedback, or log and skip
    console.error("Extraction validation failed:", parsed.error.issues);
    throw new Error("Extraction output failed Zod validation");
  }

  return parsed.data;
}
```

### Phase A Few-Shot Examples

These examples are included in the system prompt (or as prefilled assistant turns) to calibrate extraction behavior. They demonstrate the "minimal, actionable entities" principle across different capture sources.

#### Example 1: CLI Quick Capture

**Raw Note:**
```
Source: cli
Captured at: 2026-02-07T10:30:00Z
Source metadata: { "workingDirectory": "/Users/dev/myapp", "gitBranch": "main" }

Content:
the login page is broken on safari - shows blank white screen after clicking submit. Jake saw it first on his phone
```

**Expected Extraction:**
```json
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
        "type": {
          "confidence": 0.95,
          "reason": "Clearly describes a bug: something is broken and needs fixing"
        },
        "content": {
          "confidence": 0.95,
          "reason": "The problem is explicitly described"
        },
        "status": {
          "confidence": 1.0,
          "reason": "New extraction, always captured"
        },
        "category": {
          "confidence": 0.95,
          "reason": "'broken' and 'blank white screen' clearly indicate a bug"
        },
        "owner": {
          "confidence": 0.4,
          "reason": "Jake discovered the bug but is not explicitly assigned to fix it"
        }
      },
      "confidence": 0.4
    }
  ],
  "relationships": []
}
```

**Why this extraction works:**
- Single entity, not multiple. "Jake saw it first" is context, not a separate insight.
- `owner` confidence is 0.4 because Jake *reported* the bug -- he was not *assigned* to fix it. This low confidence will route the entity to the review queue for the `assignee_suggestion` review type.
- Entity-level confidence (0.4) is the minimum of all field confidences, pulled down by the uncertain owner field.

---

#### Example 2: Slack Message

**Raw Note:**
```
Source: slack
Captured at: 2026-02-06T15:45:00Z
Source metadata: { "channelId": "C04ABC123", "channelName": "#product", "messageTs": "1738856700.000100", "userId": "U02XYZ789", "permalink": "https://myteam.slack.com/archives/C04ABC123/p1738856700000100" }

Content:
Hey team, after looking at the analytics this morning I think we should switch the onboarding flow from 5 steps to 3. Conversion drops 40% between step 3 and step 4. @maria can you take point on the redesign? We also need to decide whether to keep the progress bar or switch to a stepper component.
```

**Expected Extraction:**
```json
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
        {
          "quote": "I think we should switch the onboarding flow from 5 steps to 3",
          "startOffset": 48,
          "endOffset": 110
        },
        {
          "quote": "Conversion drops 40% between step 3 and step 4",
          "startOffset": 112,
          "endOffset": 160
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.85,
          "reason": "'we should switch' indicates a decision, though phrased as suggestion"
        },
        "content": {
          "confidence": 0.95,
          "reason": "The change is explicitly described"
        },
        "status": {
          "confidence": 0.7,
          "reason": "'I think we should' is suggestive, not a final declaration -- could still be pending team agreement"
        },
        "chosen": {
          "confidence": 0.7,
          "reason": "Stated as a recommendation, not a confirmed final decision"
        },
        "rationale": {
          "confidence": 0.95,
          "reason": "Data point is explicitly stated"
        }
      },
      "confidence": 0.7
    },
    {
      "type": "task",
      "content": "Redesign onboarding flow (reduce from 5 steps to 3)",
      "status": "captured",
      "attributes": {
        "category": "feature",
        "owner": "maria",
        "priority": null,
        "complexity": null
      },
      "tags": ["onboarding", "redesign", "ux"],
      "evidence": [
        {
          "quote": "@maria can you take point on the redesign?",
          "startOffset": 162,
          "endOffset": 205
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.95,
          "reason": "Explicit request for someone to do work"
        },
        "content": {
          "confidence": 0.9,
          "reason": "Redesign is explicitly requested; scope inferred from the decision context"
        },
        "status": {
          "confidence": 1.0,
          "reason": "New extraction, always captured"
        },
        "category": {
          "confidence": 0.8,
          "reason": "Redesigning a flow is a feature/improvement, not a bug fix"
        },
        "owner": {
          "confidence": 0.85,
          "reason": "Directly asked '@maria' to 'take point', though phrased as a question"
        }
      },
      "confidence": 0.8
    },
    {
      "type": "decision",
      "content": "Choose between progress bar and stepper component for onboarding UI",
      "status": "pending",
      "attributes": {
        "options": ["Keep progress bar", "Switch to stepper component"],
        "chosen": null,
        "rationale": null,
        "decidedBy": null
      },
      "tags": ["onboarding", "ui-components"],
      "evidence": [
        {
          "quote": "We also need to decide whether to keep the progress bar or switch to a stepper component",
          "startOffset": 207,
          "endOffset": 296
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.95,
          "reason": "'need to decide' explicitly frames this as a decision"
        },
        "content": {
          "confidence": 0.95,
          "reason": "The two options are explicitly stated"
        },
        "status": {
          "confidence": 0.95,
          "reason": "'need to decide' clearly indicates this is unresolved"
        }
      },
      "confidence": 0.95
    }
  ],
  "relationships": [
    {
      "sourceIndex": 0,
      "targetIndex": 1,
      "relationshipType": "derived_from"
    },
    {
      "sourceIndex": 2,
      "targetIndex": 1,
      "relationshipType": "related_to"
    }
  ]
}
```

**Why this extraction works:**
- Three entities from a rich message -- each is genuinely distinct. The "40% drop" data point is absorbed into the decision's rationale, not extracted as a separate insight.
- The redesign task is `derived_from` the decision to simplify. The pending UI decision is `related_to` the task.
- The first decision has status `decided` at 0.7 confidence because "I think we should" is suggestive rather than definitive. This will surface in the review queue.
- The `owner` on the task is "maria" at 0.85 confidence -- phrased as a question ("can you take point?") but directionally clear.

---

#### Example 3: Meeting Transcript Snippet

**Raw Note:**
```
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
```

**Expected Extraction:**
```json
{
  "entities": [
    {
      "type": "task",
      "content": "Implement token bucket rate limiting for API (gateway middleware + Redis counters)",
      "status": "captured",
      "attributes": {
        "category": "feature",
        "owner": "Jordan",
        "priority": "high",
        "complexity": "medium"
      },
      "tags": ["api", "rate-limiting", "infrastructure", "redis"],
      "evidence": [
        {
          "quote": "decided to go with a token bucket algorithm, but nobody picked it up",
          "startOffset": 248,
          "endOffset": 316
        },
        {
          "quote": "Jordan: I can take it. Should be a medium-sized piece of work, maybe 3-4 days. I'll need to touch the gateway middleware and add Redis counters.",
          "startOffset": 318,
          "endOffset": 463
        },
        {
          "quote": "Let's make it high priority",
          "startOffset": 473,
          "endOffset": 500
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.95,
          "reason": "Clear work item with explicit assignment"
        },
        "content": {
          "confidence": 0.95,
          "reason": "Algorithm choice, scope, and implementation details all stated"
        },
        "status": {
          "confidence": 1.0,
          "reason": "New extraction, always captured"
        },
        "category": {
          "confidence": 0.85,
          "reason": "New capability (rate limiting), though could be 'improvement'"
        },
        "owner": {
          "confidence": 0.95,
          "reason": "Jordan explicitly volunteers: 'I can take it'"
        },
        "priority": {
          "confidence": 0.95,
          "reason": "Alex explicitly says 'Let's make it high priority'"
        },
        "complexity": {
          "confidence": 0.85,
          "reason": "Jordan says 'medium-sized piece of work, maybe 3-4 days'"
        }
      },
      "confidence": 0.85
    },
    {
      "type": "task",
      "content": "Update API docs with rate limit headers (429 response, X-RateLimit headers)",
      "status": "captured",
      "attributes": {
        "category": "chore",
        "owner": "Sam",
        "priority": null,
        "complexity": "small"
      },
      "tags": ["api", "documentation", "rate-limiting"],
      "evidence": [
        {
          "quote": "Sam, can you update the API docs to include rate limit headers once Jordan's done?",
          "startOffset": 502,
          "endOffset": 585
        },
        {
          "quote": "Sam: Sure, I'll add a section on the 429 response and the X-RateLimit headers.",
          "startOffset": 587,
          "endOffset": 666
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.95,
          "reason": "Explicit documentation work assigned to Sam"
        },
        "content": {
          "confidence": 0.95,
          "reason": "Exact scope stated: 429 response and X-RateLimit headers"
        },
        "status": {
          "confidence": 1.0,
          "reason": "New extraction, always captured"
        },
        "category": {
          "confidence": 0.8,
          "reason": "Documentation update is a chore, not a feature"
        },
        "owner": {
          "confidence": 0.95,
          "reason": "Sam is directly asked and confirms"
        },
        "complexity": {
          "confidence": 0.75,
          "reason": "Adding a docs section is typically small, but not explicitly sized"
        }
      },
      "confidence": 0.75
    },
    {
      "type": "insight",
      "content": "Customers want a usage dashboard for API consumption",
      "status": "captured",
      "attributes": {
        "sentiment": "neutral",
        "dataPoints": [
          "Sales team is hearing customer requests for a usage dashboard"
        ],
        "feasibility": "Not scoped for current sprint; needs further investigation"
      },
      "tags": ["api", "dashboard", "customer-feedback"],
      "evidence": [
        {
          "quote": "I've been hearing from the sales team that customers want a usage dashboard. Not sure if that's in scope for this sprint but we should track it.",
          "startOffset": 684,
          "endOffset": 828
        }
      ],
      "fieldConfidence": {
        "type": {
          "confidence": 0.85,
          "reason": "Priya frames this as something to 'track', not an immediate action item -- insight rather than task"
        },
        "content": {
          "confidence": 0.9,
          "reason": "The customer desire is clearly stated"
        },
        "status": {
          "confidence": 1.0,
          "reason": "New extraction, always captured"
        },
        "sentiment": {
          "confidence": 0.8,
          "reason": "Customer request is informational, not positive or negative"
        }
      },
      "confidence": 0.8
    }
  ],
  "relationships": [
    {
      "sourceIndex": 0,
      "targetIndex": 1,
      "relationshipType": "related_to"
    }
  ]
}
```

**Why this extraction works:**
- Three entities from a meeting snippet: two tasks with clear owners and one insight for tracking.
- "Three customers hit the 429 limit" and the support tickets are absorbed as context for the rate limiting task, not extracted as separate insights. This follows the minimal extraction principle.
- The prior decision ("decided to go with a token bucket algorithm") is referenced but not re-extracted as a new decision since it was made last month. The current extraction focuses on the work being assigned now.
- The docs task has a dependency on Jordan's work ("once Jordan's done") -- this is expressed as a `related_to` relationship. The system can later infer ordering from this.
- Priya's usage dashboard mention is an insight, not a task, because she explicitly says "not sure if that's in scope" and "we should track it". It could be promoted to a task later.

---

### Confidence Scoring

Confidence scores flow from field-level to entity-level:

```
Entity confidence = min(all field confidences)
```

This means a single uncertain field pulls down the whole entity's score. This is intentional -- it ensures entities with ANY ambiguous field surface in the review queue.

**Threshold for review routing:**
- Entity confidence below 0.9 -- route to `review_queue` with `review_type: "low_confidence"`
- Any individual field below 0.7 -- route to `review_queue` with the specific review type (e.g., `type_classification` if the `type` field is low, `assignee_suggestion` if `owner` is low)

**What gets stored in the database:**

The entity-level `confidence` goes into `entities.confidence` (the real column). The field-level breakdown goes into `entities.ai_meta.fieldConfidence` as a `Record<string, FieldConfidence>`, along with model/prompt version metadata:

```typescript
// Stored in entities.ai_meta (EntityAiMeta type)
{
  model: "claude-sonnet-4-20250514",
  promptVersion: "extraction-v1.0",
  extractionRunId: "run_abc123",
  fieldConfidence: {
    type: { confidence: 0.95, reason: "Explicitly described as a bug" },
    content: { confidence: 0.95, reason: "Problem is explicitly stated" },
    status: { confidence: 1.0, reason: "Always captured on extraction" },
    "attributes.category": { confidence: 0.95, reason: "'broken' indicates bug_fix" },
    "attributes.owner": {
      confidence: 0.4,
      reason: "Jake reported the bug, not assigned to fix",
      evidence: [{ rawNoteId: "...", quote: "Jake saw it first" }]
    }
  }
}
```

### Evidence Capture

Evidence is stored in `entities.evidence` as an array of `EntityEvidence` objects. The extraction pipeline maps from the Zod output to the database type:

```typescript
// Extraction output (from Zod schema above)
evidence: [
  { quote: "the login page is broken on safari", startOffset: 0, endOffset: 35 }
]

// Stored in entities.evidence (EntityEvidence[] type)
[
  {
    rawNoteId: "uuid-of-the-raw-note",  // Added by the pipeline
    quote: "the login page is broken on safari",
    startOffset: 0,
    endOffset: 35,
    permalink: null  // Or Slack permalink if source is Slack
  }
]
```

The `rawNoteId` is not provided by the AI -- it is injected by the pipeline after extraction, since the pipeline knows which raw note is being processed. The `permalink` is copied from `raw_notes.source_meta.permalink` when available (e.g., Slack messages).

---

## Phase B -- Organization Prompt

Phase B takes extracted entities from Phase A plus a list of active projects/epics and assigns organizational context: project, epic, duplicates, and assignee resolution.

### Phase B System Prompt

```
You are an organization system for a project management tool. You receive entities that were just extracted from raw notes, along with a list of active projects and their epics. Your job is to route each entity to the correct project and epic.

## Your Inputs

1. **Extracted entities**: An array of entities (from Phase A extraction), each with type, content, attributes, tags, and evidence.
2. **Active projects**: A list of projects with their names, descriptions, and epics.
3. **Recent entities**: A sample of recently created entities per project (for duplicate detection context).
4. **Known users**: A list of team members (for assignee resolution).

## Your Tasks

For each extracted entity, determine:

### 1. Project Assignment
Which project does this entity belong to? Consider:
- The entity's tags and content
- The project descriptions
- The source context (e.g., which Slack channel, which git repo)
- If no project is a clear match, set projectId to null. The entity will be routed to the review queue.

### 2. Epic Assignment
Within the assigned project, does this entity belong to an existing epic? Consider:
- The entity's tags and content
- The epic names and descriptions
- If no epic is a clear match, set epicId to null. The entity remains "unepiced" until the user or AI suggests an epic later.

### 3. Duplicate Detection
Is this entity likely a duplicate of an existing entity? Consider:
- Content similarity (exact or near-exact matches)
- Same topic/tags + similar timeframe
- Different sources describing the same work item
- Return candidate duplicate IDs with similarity scores. Only flag candidates with similarity above 0.7.

### 4. Assignee Resolution
If the entity has an `attributes.owner` string (e.g., "Sarah", "maria"), resolve it to a user ID from the known users list. Consider:
- Exact name match (case-insensitive)
- Partial match (first name matches a user's full name)
- Slack user ID match (if source is Slack)
- If no match is found, set assigneeId to null and flag for review.

## Confidence Scoring

Provide a confidence score (0.0-1.0) for each assignment:
- Project assignment confidence
- Epic assignment confidence
- Duplicate detection confidence (per candidate)
- Assignee resolution confidence

Items with any confidence below 0.9 will be routed to the human review queue.

## Output

Call the `organize_entities` tool with the structured output. Do not produce any other text.
```

### Phase B Zod Schema

```typescript
import { z } from "zod";

// ============================================================
// Duplicate candidate
// ============================================================
const duplicateCandidateSchema = z.object({
  /** ID of the existing entity that may be a duplicate. */
  entityId: z.string().uuid()
    .describe("UUID of the existing entity suspected as duplicate"),
  /** Similarity score (0.0-1.0). Only include if above 0.7. */
  similarityScore: z.number().min(0.7).max(1.0)
    .describe("Content similarity score"),
  /** Why this is flagged as a potential duplicate. */
  reason: z.string()
    .describe("Brief explanation of why this is a duplicate candidate"),
});

// ============================================================
// Per-entity organization result
// ============================================================
const entityOrganizationSchema = z.object({
  /** Index of the entity in the input array (0-based). */
  entityIndex: z.number().int().nonnegative()
    .describe("Index in the extracted entities array"),

  // -- Project assignment --
  projectId: z.string().uuid().nullable()
    .describe("Assigned project UUID, or null if uncertain"),
  projectConfidence: z.number().min(0).max(1)
    .describe("Confidence in project assignment"),
  projectReason: z.string()
    .describe("Why this project was chosen"),

  // -- Epic assignment --
  epicId: z.string().uuid().nullable()
    .describe("Assigned epic UUID, or null if no match / uncertain"),
  epicConfidence: z.number().min(0).max(1)
    .describe("Confidence in epic assignment"),
  epicReason: z.string()
    .describe("Why this epic was chosen (or why none matched)"),

  // -- Duplicate detection --
  duplicateCandidates: z.array(duplicateCandidateSchema)
    .describe("Existing entities that may be duplicates. Empty if none."),

  // -- Assignee resolution --
  assigneeId: z.string().uuid().nullable()
    .describe("Resolved user UUID from owner string, or null"),
  assigneeConfidence: z.number().min(0).max(1).nullable()
    .describe("Confidence in assignee resolution, or null if no owner string"),
  assigneeReason: z.string().nullable()
    .describe("How the owner string was resolved (or why it could not be)"),
});

// ============================================================
// Epic suggestion (AI proposes a new epic based on patterns)
// ============================================================
const epicSuggestionSchema = z.object({
  /** Proposed name for the new epic. */
  name: z.string()
    .describe("Suggested epic name"),
  /** Proposed description. */
  description: z.string().nullable()
    .describe("Suggested epic description"),
  /** Which project the epic should belong to. */
  projectId: z.string().uuid()
    .describe("UUID of the project for this epic"),
  /** Indices of entities (from input array) that would belong to this epic. */
  entityIndices: z.array(z.number().int().nonnegative())
    .describe("Indices of entities that fit this proposed epic"),
  /** Why the AI is suggesting this epic. */
  reason: z.string()
    .describe("Explanation of the pattern that suggests this grouping"),
});

// ============================================================
// Top-level organization result
// ============================================================
export const organizationResultSchema = z.object({
  entityOrganizations: z.array(entityOrganizationSchema)
    .describe("Organization decisions for each extracted entity"),
  epicSuggestions: z.array(epicSuggestionSchema)
    .describe("New epics the AI suggests creating based on entity patterns. Empty if none."),
});

export type OrganizationResult = z.infer<typeof organizationResultSchema>;
```

### Phase B Claude API tool_use Format

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { organizationResultSchema } from "./schemas";

const ORGANIZATION_SYSTEM_PROMPT = `...`; // The system prompt from above

interface ProjectContext {
  id: string;
  name: string;
  description: string | null;
  epics: { id: string; name: string; description: string | null }[];
}

interface RecentEntity {
  id: string;
  type: string;
  content: string;
  tags: string[];
  projectId: string;
}

interface KnownUser {
  id: string;
  name: string;
  email: string;
}

async function organizeEntities(
  client: Anthropic,
  extractedEntities: unknown[],
  projects: ProjectContext[],
  recentEntities: RecentEntity[],
  knownUsers: KnownUser[],
  rawNoteSource: string,
  sourceMeta?: Record<string, unknown>,
) {
  const userMessage = [
    `## Extracted Entities`,
    "```json",
    JSON.stringify(extractedEntities, null, 2),
    "```",
    ``,
    `## Active Projects`,
    "```json",
    JSON.stringify(projects, null, 2),
    "```",
    ``,
    `## Recent Entities (for duplicate detection)`,
    "```json",
    JSON.stringify(recentEntities, null, 2),
    "```",
    ``,
    `## Known Users`,
    "```json",
    JSON.stringify(knownUsers, null, 2),
    "```",
    ``,
    `## Source Context`,
    `- Source: ${rawNoteSource}`,
    sourceMeta
      ? `- Source metadata: ${JSON.stringify(sourceMeta)}`
      : null,
  ].filter(Boolean).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: ORGANIZATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [
      {
        name: "organize_entities",
        description:
          "Assign extracted entities to projects, epics, and detect duplicates. " +
          "Call this tool exactly once.",
        input_schema: zodToJsonSchema(
          organizationResultSchema
        ) as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: "organize_entities" },
  });

  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use"
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("No tool_use block in response");
  }

  const parsed = organizationResultSchema.safeParse(toolUseBlock.input);

  if (!parsed.success) {
    console.error("Organization validation failed:", parsed.error.issues);
    throw new Error("Organization output failed Zod validation");
  }

  return parsed.data;
}
```

### Phase B Few-Shot Example

This example shows how the organization phase routes a set of extracted entities to projects, epics, and detects a duplicate.

**Input -- Extracted Entities (from Phase A):**
```json
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
```

**Input -- Active Projects:**
```json
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
```

**Input -- Recent Entities (for duplicate detection):**
```json
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
```

**Input -- Known Users:**
```json
[
  { "id": "user-001", "name": "Jordan Chen", "email": "jordan@company.com" },
  { "id": "user-002", "name": "Sam Patel", "email": "sam@company.com" },
  { "id": "user-003", "name": "Maria Garcia", "email": "maria@company.com" },
  { "id": "user-004", "name": "Alex Kim", "email": "alex@company.com" }
]
```

**Expected Organization Output:**
```json
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
          "reason": "Both describe implementing rate limiting on the API. The existing entity is more generic ('Add rate limiting') while the new one specifies the algorithm (token bucket) and implementation (gateway + Redis). May be a more detailed version of the same work."
        }
      ],
      "assigneeId": "user-001",
      "assigneeConfidence": 0.9,
      "assigneeReason": "Owner string 'Jordan' matches 'Jordan Chen' (first name match, only Jordan in the team)"
    },
    {
      "entityIndex": 1,
      "projectId": "proj-001",
      "projectConfidence": 0.95,
      "projectReason": "API documentation is part of the Platform API project",
      "epicId": "epic-011",
      "epicConfidence": 0.9,
      "epicReason": "The 'API Documentation' epic covers 'developer-facing API docs', and this task adds rate limit header documentation",
      "duplicateCandidates": [],
      "assigneeId": "user-002",
      "assigneeConfidence": 0.9,
      "assigneeReason": "Owner string 'Sam' matches 'Sam Patel' (first name match, only Sam in the team)"
    },
    {
      "entityIndex": 2,
      "projectId": "proj-002",
      "projectConfidence": 0.7,
      "projectReason": "The usage dashboard request is a customer-facing feature, which aligns better with Customer Portal than Platform API. However, it could also be an internal monitoring tool under Platform API.",
      "epicId": "epic-020",
      "epicConfidence": 0.65,
      "epicReason": "The 'Usage Analytics' epic in Customer Portal describes 'dashboard showing API usage', which closely matches. Lower confidence because the insight is vague and may mean something different from the existing epic scope.",
      "duplicateCandidates": [],
      "assigneeId": null,
      "assigneeConfidence": null,
      "assigneeReason": null
    }
  ],
  "epicSuggestions": []
}
```

**What happens after this output:**

The pipeline processes each `entityOrganization` result:

1. **Entity 0 (rate limiting task)**: Assigned to `proj-001` / `epic-010` at high confidence. The duplicate candidate (`ent-existing-001` at 0.8 similarity) creates a `review_queue` entry with `review_type: "duplicate_detection"` so a human can confirm whether to merge. Assignee resolved to `user-001` (Jordan Chen).

2. **Entity 1 (docs task)**: Assigned to `proj-001` / `epic-011` at high confidence. No duplicates. Assignee resolved to `user-002` (Sam Patel). All confidences above 0.9, so this entity does NOT enter the review queue -- it is directly created.

3. **Entity 2 (usage dashboard insight)**: Project assigned to `proj-002` at 0.7 confidence and epic at 0.65 confidence. Both below the 0.9 threshold, so two `review_queue` entries are created: one for `project_assignment` and one for `epic_assignment`. The human reviewer sees: "AI suggests Customer Portal / Usage Analytics (65% confident) -- is this right?"

---

## Pipeline Integration Summary

The two phases execute sequentially for each raw note:

```
raw_note (unprocessed)
    │
    ▼
[Phase A: Entity Extraction]
    │  Input: raw note content + source metadata
    │  Output: ExtractionResult (entities + relationships)
    │  Validates against: extractionResultSchema (Zod)
    │
    ▼
[Phase B: Organization]
    │  Input: extracted entities + active projects/epics + recent entities + users
    │  Output: OrganizationResult (assignments + epic suggestions)
    │  Validates against: organizationResultSchema (Zod)
    │
    ▼
[Pipeline writes to database]
    │  1. Insert entities (with project_id, epic_id, assignee_id, confidence, ai_meta, evidence)
    │  2. Insert entity_sources links (entity <-> raw_note)
    │  3. Insert entity_relationships (intra-note relationships)
    │  4. Insert review_queue entries (for low-confidence assignments, duplicates)
    │  5. Mark raw_note as processed
    │
    ▼
[Review queue populated]
    Human reviews low-confidence items in the PWA.
    Corrections feed back into DSPy optimization (Phase 2).
```

Each Phase uses `tool_choice: { type: "tool", name: "..." }` to force structured output. Zod validates the response. On validation failure, the pipeline retries once with the validation error appended to the user message. On second failure, the raw note is marked with `processing_error` and skipped.
