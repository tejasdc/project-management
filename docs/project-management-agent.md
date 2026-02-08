# AI-Powered Project Management Agent

## Feature Overview

An AI-powered project management system that automatically captures, organizes, and tracks the lifecycle of ideas, requirements, and work across projects. The system minimizes manual intervention by using AI inference to extract structured entities from unstructured inputs (quick thoughts, Slack messages, meeting transcripts) and organize them into projects.

The system has two major components:
1. **Capture + AI Organizer** (primary focus): Ingest raw notes from multiple sources, extract typed entities, route them to projects, and provide review workflows for ambiguous items.
2. **Work Evolution Tracker** (future, but design must accommodate): Automatically trace the lineage of how requirements evolve through features, tasks, bugs, and fixes using Claude Code session history and git commits.

---

## Background

### Problem Statement
- Ideas, requirements, and decisions are scattered across Slack, meetings, quick notes, and conversations.
- No single system captures and organizes them automatically.
- As projects grow, there's an "explosion of ideas/projects" with no clear overview of what's active and what's happening.
- Work evolution is invisible — a requirement becomes a feature, which becomes tasks, which spawn bugs, but this lineage is lost.
- Current tools require manual entry and organization, which doesn't happen consistently.

### Core Principles
1. **Agent-native**: Every tool and interface must be accessible by AI agents — no manual-only workflows.
2. **Minimal manual intervention**: Manual input is limited to (a) capturing thoughts and (b) reviewing low-confidence AI decisions.
3. **Leverage existing tools**: Don't reinvent wheels. Use existing tools where they provide required functionality.
4. **Design for evolution**: The data model and architecture must accommodate the Work Evolution Tracker without major refactoring.
5. **Handle parallelism**: Multiple features/tasks will be in-flight simultaneously across Claude Code sessions. The system must not confuse them.
6. **Zero-annotation inference**: The system should infer project/feature context from available signals (session history, git branches, commit messages) without requiring explicit tagging from the user.
7. **Infrastructure as Code**: All deployment infrastructure defined in `render.yaml` — zero manual creation in the Render dashboard. Every service, database, and cron job is version-controlled.

---

## Requirements

### Capture System
- **Quick capture**: Multiple surfaces, all calling the same `capture_note()` API endpoint.
  - P0: CLI tool (`pm capture "..."`), Slack bot (slash command + emoji reaction)
  - P1: Apple Shortcuts (text + voice via Whisper API), MCP tools for agent access
  - P2: Fireflies.ai integration for meeting transcripts
- **Slack ingestion**: Bot captures via `/capture` slash command or pushpin emoji reaction on any message.
- **Meeting transcript ingestion**: Fireflies.ai API (pre-extracts action items, decisions, questions). Google Meet transcripts via API as alternative.
- **Raw notes preserved**: All original inputs stored in `raw_notes` table — never modified or lost. Entities are extracted copies, not mutations of the source.
- **PWA for review/dashboard**: Progressive Web App installable on mobile — no native app needed.

### AI Organizer

Two-phase processing pipeline:

**Phase A — Entity Extraction**: Process raw notes → extract typed entities (Task, Decision, Insight) with content, attributes, confidence scores. This is the structured extraction step.

**Phase B — Organization**: Given extracted entities + list of active projects/epics, assign each entity:
- Project assignment (with confidence/probability)
- Epic suggestion (if applicable)
- Duplicate detection (embedding similarity against existing entities)
- Assignee suggestion (if signals exist, e.g., "Sarah will handle...")

Both phases produce confidence scores. Low-confidence items go to the review queue.

**Review UI** — Single screen with AI suggestions:
- List of items needing review, each showing the AI's suggestion and confidence
- Types of suggestions: entity type classification, project assignment, epic grouping, duplicate detection, epic creation (AI suggests creating a new epic based on patterns in tasks)
- User actions: accept suggestion, provide different answer, add training comment
- Training comments are preserved and feed back into extraction improvement (Phase 2: DSPy)
- Quick actions: one-click accept, dropdown to reassign to different project/epic, merge duplicates

**Project Dashboard** — Project management views:
- Project list with summary stats (tasks by status, open decisions, recent insights)
- Single project view: epics, tasks (filterable by status, category, assignee, priority), decisions, insights
- Filters and selection criteria across all views
- Ungrouped items view (entities not yet assigned to an epic)

**Deduplication/synthesis**: Detect when two inputs from different sources describe the same thing via embedding similarity + fuzzy matching. Candidate duplicates surface in review queue for human confirmation.

### Work Evolution Tracker (Future — Design Space Reserved)
- Track lineage: raw note → requirement → feature → task → bug → fix.
- Automatically derived from Claude Code session history + git commits.
- Concept map visualization showing how work evolved.
- Must handle sessions that evolve — a session may start as one feature and morph into something else.
- Must handle parallel sessions/features within the same project.

---

## Brainstorming & Investigation

### Entity Model

#### Evolution of Thinking

Initially considered a wide type system (requirement, idea, decision, task, bug, insight) with an additional "intent" axis. Through brainstorming, we simplified significantly.

**Key insights that drove simplification**:
1. Over-extraction is a failure mode — extracting 4 entities from one sentence creates noise, not clarity.
2. A bug is just a task with `category: bug_fix`. A feature is just a task with `category: feature`. The distinction is an *attribute*, not a *type*.
3. "Insight" and "idea" are not meaningfully different — an insight can inform a potential action just like an idea can. Collapsed into one type.
4. Context/reasoning belongs *within* an entity (as attributes or context field), not as separate entities. E.g., "3 users dropped off at step 2" is context for a decision/task, not a standalone insight.

#### Final Entity Type System (3 types)

| Type | What it is | Actionable? |
|---|---|---|
| **Task** | Something that needs to be done (feature, bug fix, refactor, etc.) | Yes |
| **Decision** | Something that needs to be decided or was already decided | Yes (until resolved) |
| **Insight** | An observation, idea, feedback, data point, or potential future action | Not directly — but can *become* a task via promotion |

#### Project & Epic Hierarchy

The organizational hierarchy is:

```
Project (user-maintained, top-level)
  └── Epic (intentional grouping — user-created or AI-suggested)
  │     └── Task (extracted entity, linked via epic_id)
  │     └── Task
  │           └── Task (subtask, linked via parent_task_id)
  │     └── Decision (scoped to this epic)
  │
  └── Task (not yet grouped — "unepiced")
  └── Decision (project-level)
  └── Insight (could suggest new epics)
```

**Projects** are user-maintained. The user provides and maintains a list of active projects. The AI routes extracted entities to the correct project via inference.

**Epics** are a first-class organizational concept, NOT an extracted entity type. They don't go through the extraction pipeline. Two creation paths:
- **User-created**: "Create an Authentication epic"
- **AI-suggested**: "I see 5 tasks related to authentication — create an epic?" → goes to review queue

**Epic status is computed, not set.** An epic's progress is derived from its child tasks. If 3/5 tasks are done, the epic is 60% complete. No manual status management.

**One epic per entity (or none).** An entity belongs to at most one epic. If something spans two epics, either pick the primary one or split into two entities. Keeps organization clean and unambiguous.

Epic schema (lightweight — not an entity):
```
Epic {
  id
  name: "User Authentication"
  description: "All work related to auth: login, signup, password reset, OAuth"
  project_id: FK → projects
  created_by: "user" | "ai_suggestion"
  created_at
  // status: computed from child entities
}
```

#### Entity Structure

Common fields (all entity types):
- `id`: unique identifier
- `type`: task | decision | insight
- `content`: extracted description
- `status`: varies by type (see below)
- `project_id`: FK → projects (which project this belongs to)
- `epic_id`: nullable FK → epics (which epic this is grouped under, if any)
- `source[]`: references back to raw note(s) this was extracted from
- `about[]`: tags — topics, features, areas
- `confidence`: AI's confidence in the extraction and routing
- `created_at`: timestamp
- `attributes{}`: flexible JSON blob for type-specific data

Type-specific attributes (in the JSON blob):
- **Task**: `{ category, owner, priority, complexity, ... }`
  - `category` values: `feature`, `bug_fix`, `improvement`, `chore`, `refactor`, `story`, etc.
  - `owner`: raw name string from AI extraction (e.g., "Sarah"). Resolved to `assignee_id` FK by the application layer.
- **Decision**: `{ options[], chosen, rationale, decided_by, ... }`
- **Insight**: `{ sentiment, data_points, feasibility, ... }`

Status values per type:
- **Task**: `captured → needs_action → in_progress → done`
- **Decision**: `pending → decided`
- **Insight**: `captured → acknowledged` (and can be `promoted` → becomes a task)

#### Entity Relationships

Three kinds of relationships exist in the system:

**Structural (foreign keys on the entity):**
- `project_id`: Entity → Project (which project)
- `epic_id`: Entity → Epic (which epic, nullable)
- `parent_task_id`: Task → Task (task/subtask hierarchy, nullable FK column)
- `assignee_id`: Entity → User (who is responsible, nullable FK column)

**Provenance (via `entity_sources` join table):**
- Entity ↔ Raw Note: Many-to-many link tracking which raw notes an entity was extracted from. Indexed bidirectionally for forward lookup (entity → notes) and reverse lookup (note → entities).

**Graph relationships (in `entity_relationships` table, entity-to-entity only):**
- `derived_from`: Entity ← Entity (provenance — this came from that, e.g., task from a decision)
- `related_to`: Entity ↔ Entity (bidirectional association)
- `promoted_to`: Insight → Task (lifecycle — insight became actionable)
- `duplicate_of`: Entity → Entity (deduplication — flagged as same item)

**Why three kinds:** Structural links (project, epic, parent) are singular and stable — a task belongs to one project, one epic. These are best modeled as foreign keys for simple queries. Entity-to-raw-note provenance uses the `entity_sources` join table, providing a bidirectionally indexed many-to-many link for tracking extraction provenance. Graph relationships in `entity_relationships` are strictly entity-to-entity and represent lineage/associations — these feed the future Evolution Tracker and are best modeled in a dedicated relationships table.

#### Extraction Principle: Minimal, Actionable Entities

When extracting from raw notes, prefer fewer, richer entities over many thin ones. Context and reasoning should be captured as attributes within an entity, not as separate entities. Only extract a separate entity when there is a genuinely distinct actionable item or distinct decision.

**Example**: *"The onboarding flow is confusing. Three users dropped off at step 2 last week. We decided to simplify it to two steps. Sarah will handle the redesign."*

Extracted as:
```
Entity 1 {
  type: decision
  content: "Simplify onboarding to 2 steps"
  status: decided
  attributes: { rationale: "3 users dropped off at step 2 last week, flow is confusing" }
}

Entity 2 {
  type: task
  content: "Redesign onboarding flow (2 steps)"
  status: needs_action
  attributes: { owner: "Sarah", category: "redesign" }
  relationships: [derived_from → Entity 1]
}
```

Two entities, not four. The observation data is context within the decision.

### Data Store: Graph DB vs. Relational (Research Complete)

**Decision: PostgreSQL. Not Neo4j.**

Research agents investigated performance benchmarks, case studies, and operational complexity. Key findings:

**Why not Neo4j:**
- Neo4j outperforms Postgres only for dense, highly-connected networks (social graphs, fraud detection) with 1M+ nodes and high branching factors. Our entity graph has low fan-out (task derives from 1-2 parents) and tree-shaped lineage.
- At our scale (hundreds to thousands of entities), Postgres recursive CTEs return in sub-10ms.
- Neo4j adds a second database to manage (backups, monitoring, sync), niche skill set, and Community Edition has significant limitations (no clustering, cold backups only, slower Cypher runtime).
- Linear, Notion, and GitHub Issues all use Postgres for relationship-heavy project data.

**Escape hatch: Apache AGE**
- A Postgres extension that adds Cypher (Neo4j's query language) support directly on Postgres tables.
- No data migration needed — install it only if recursive CTEs feel limiting.
- Trigger conditions: entity count >50K, traversal depths >5, need for graph algorithms.

**Schema approach:**
- `entities` table with common fields + JSONB attributes
- `entity_relationships` table (source_id, target_id, relationship_type, metadata)
- `raw_notes` table for all captured inputs
- `entity_sources` join table linking entities to raw notes
- Lineage queries via recursive CTEs (reusable SQL function)

See full research: `/Users/tejasdc/workspace/project-management/research/ai-entity-extraction-landscape.md`

### Quick Capture & Ingestion (Research Complete)

**Prioritized capture surfaces:**

| Priority | Surface | Effort | Why |
|---|---|---|---|
| P0 | **CLI tool** (`pm capture "..."`) | 1 day | Lowest friction for devs, immediately agent-native |
| P0 | **Slack bot** (slash command + emoji reaction) | 2-3 days | Captures from team communication. Emoji react on any message = zero retyping |
| P1 | **Apple Shortcut** (text + voice via Whisper API) | 1 day | Mobile capture without building an app |
| P1 | **MCP server** (expose capture + query as tools) | 2-3 days | Makes entire system agent-native for Claude Code |
| P2 | **Fireflies.ai integration** | 1-2 days | Meeting transcripts with pre-extracted action items |
| P3 | Browser extension, Telegram, Obsidian | As needed | Diminishing returns |

**Architecture principle: All surfaces call the same `capture_note()` function.** CLI, Slack bot, HTTP endpoint, MCP tool — all write to the same `raw_notes` table.

**Processing pipeline:**
```
[Capture Surface] --> raw_notes table (processed=false, external_id for dedup)
                          |
                    [BullMQ job / periodic]
                          |
                    [AI Entity Extraction]
                    Phase 1: Claude API + Zod (TypeScript)
                    Phase 2: DSPy Python worker (sidecar)
                          |
                    entities table + relationships + entity_events
                          |
                    raw_notes.processed = true
```

**Key finding on meeting transcripts:** Fireflies.ai already extracts action items, decisions, and questions — these map directly to our Task, Decision, Insight types. Can use as first-pass extraction and enrich with our pipeline.

### AI Entity Extraction Pipeline (Research Complete)

**No existing tool does exactly what we need** (end-to-end extraction from heterogeneous sources into a unified entity graph). But strong building blocks exist.

#### Phased Approach

**Phase 1 — TypeScript extraction (launch):**
- Claude API `tool_use` with Zod schemas for structured output
- Zod validates response; thin retry wrapper if validation fails
- Keeps entire stack in TypeScript — no Python dependency at launch
- Sufficient for initial extraction quality with well-crafted schemas + few-shot examples

**Phase 2 — DSPy self-improvement loop (when review queue has 20-50 corrections):**
- Introduce Python DSPy worker as a sidecar service
- Each human correction from the review queue becomes a training example
- Periodically re-run DSPy optimizer (BootstrapFewShot) to improve extraction
- Optimizer outputs a JSON file with optimized instructions + few-shot examples
- Self-improving system: the more users review, the better extraction becomes
- DSPy works with Claude via LiteLLM integration
- Real-world result: 22 percentage-point improvement on entity extraction documented

**Why phased:** DSPy's value kicks in at 20+ corrections. No point adding Python complexity before the system is running and generating review data. The extraction logic (Zod schemas → DSPy Signatures) is a straightforward port — schemas are conceptually identical.

**Documented failure modes to design against:**
1. **Over-extraction**: Everything becomes a task → our "minimal, actionable entities" principle mitigates
2. **Hallucinated details**: LLMs inventing data not in source → always link back to source text, include source quote in entity
3. **Poor deduplication**: Same feature requested in meeting and Slack → embedding similarity + fuzzy matching + temporal proximity
4. **Inconsistent extraction across runs**: Same input produces different entities → schema-first approach (Zod) + few-shot examples for consistency
5. **Temporal confusion**: "Next week" in a month-old transcript → always resolve relative dates at extraction time
6. **Duplicate ingestion**: Same Slack message captured twice via webhook retry → `raw_notes.external_id` with unique constraint on `(source, external_id)` ensures idempotent ingestion

**Confidence scoring approach:**
- Field-level confidence stored in `entities.ai_meta.fieldConfidence` — a map from field name (e.g., "projectId", "attributes.priority") to `{confidence, reason, evidence}`
- Entity-level `confidence` column is the minimum of all field confidences (for quick filtering)
- Items with any field below 0.9 confidence → routed to human review queue with specific field flagged
- Human corrections feed back into prompt optimization (Phase 2: DSPy)
- `ai_meta` also stores model version, prompt version, and extraction run ID for debugging and reprocessing

**Deduplication strategy:**
- `duplicate_of` relationship type between entities
- Embedding similarity search across all entities for candidate detection
- Temporal proximity + participant overlap as additional signals
- Candidate duplicates surface in the review queue for human confirmation

See full research: `/Users/tejasdc/workspace/project-management/research/ai-entity-extraction-landscape.md`

### Tech Stack (Research Complete)

#### Frontend
| Layer | Choice | Rationale |
|---|---|---|
| Build/Dev | **Vite** | Fastest DX, instant HMR, mature plugin ecosystem |
| Routing | **TanStack Router** | Type-safe, first-class URL search params (critical for dashboard filters) |
| Server State | **TanStack Query** | Caching, background refetch, optimistic updates — handles 80% of state needs |
| Client State | **Zustand** | Minimal boilerplate, only for UI state (modals, sidebar, theme) |
| Tables/Lists | **TanStack Table** | Headless sorting/filtering/pagination, pairs with TanStack Query |
| UI Components | **shadcn/ui** | Copy-paste components you own, Radix primitives, accessible, dark mode |
| Styling | **Tailwind CSS v4** | Utility-first, zero-config in v4, pairs with shadcn/ui |
| PWA | **vite-plugin-pwa** | ~10 lines of config, installable on mobile, offline caching |

**Why Vite SPA over Next.js:** Dashboard is behind authentication — zero SSR/SEO benefit. Next.js adds Server Component complexity, harder PWA setup, deployment lock-in pressure. Vite is simpler and faster for a logged-in dashboard app.

**Why not TanStack Start:** Still in Release Candidate (not 1.0). Built on same TanStack Router, so migration from Vite SPA → TanStack Start is low-cost if/when it stabilizes.

#### Backend
| Layer | Choice | Rationale |
|---|---|---|
| Runtime | **Node.js (LTS)** | Stable, maximum compatibility, easy deployment |
| API Framework | **Hono** | Best TypeScript DX, official MCP middleware, Zod-native validation, ~14KB, runs on any JS runtime |
| ORM | **Drizzle ORM** | Type-safe, zero code-gen, excellent JSONB support, `drizzle-zod` generates Zod schemas from DB tables |
| Database | **PostgreSQL** | JSONB for flexible attributes, recursive CTEs for lineage queries, battle-tested |
| Validation | **Zod** + `drizzle-zod` + `@hono/zod-validator` | Single source of truth: DB schema → Zod schema → API validation |
| Background Jobs | **BullMQ + Redis** | Proven job queue, `@bull-board/hono` for dashboard |
| Real-time | **Hono SSE** (`streamSSE()`) | Simplest path for dashboard updates |
| MCP | `@modelcontextprotocol/sdk` + `@modelcontextprotocol/hono` | Official first-party MCP middleware for Hono |

**Why Hono over alternatives:**
- vs. Express: Better TypeScript DX, 3x faster, official MCP middleware. Express is the past.
- vs. Fastify: Comparable quality, but Hono has simpler Zod integration (one-liner vs. type provider setup) and official MCP middleware. Fastify has more mature plugin ecosystem.
- vs. tRPC: Eliminated. Python DSPy worker can't call tRPC endpoints — TypeScript-only on both ends.
- vs. NestJS: Overkill. Decorator-heavy abstraction tax not justified for 1-2 devs.
- vs. Elysia: Bun-only lock-in, smaller community, no MCP middleware.

**Why Drizzle over Prisma:**
- Typed JSONB columns (Prisma's `Json` type = `any`)
- Zero code generation (Prisma requires `prisma generate` after every schema change)
- 1.5MB vs 6.5MB bundle
- `drizzle-zod` auto-generates validation schemas from DB tables — no duplication

**Hono RPC for frontend type safety:** Export `typeof route` from server, and Hono's `hc` client gives the frontend fully type-safe API calls with inferred paths, params, and return types. No code generation. Similar to tRPC's value but over standard HTTP, so Python worker can also call the same endpoints.

#### AI Extraction
| Phase | Choice | Rationale |
|---|---|---|
| Phase 1 (launch) | **Claude API + Zod schemas** (TypeScript) | Keep everything in one language. Zod validates structured output from `tool_use`. |
| Phase 2 (20-50 corrections) | **DSPy Python worker** (sidecar) | Self-improving extraction from human corrections. Python because DSPy's optimizer ecosystem is most mature there. |

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vite + React)                  │
│  TanStack Router · TanStack Query · TanStack Table · shadcn/ui │
│                         PWA (installable)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ JSON / SSE
┌──────────────────────────▼──────────────────────────────────────┐
│                     Hono API Server (Node.js)                   │
│          Zod validation · Hono RPC · MCP middleware              │
│                    Drizzle ORM · BullMQ                          │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
    ┌──────▼──────┐                    ┌──────▼──────┐
    │  PostgreSQL  │                   │    Redis     │
    │  (entities,  │                   │  (job queue) │
    │  raw_notes,  │                   └──────────────┘
    │  relations)  │
    └──────┬──────┘
           │ (shared DB — Phase 2)
    ┌──────▼──────────────┐
    │  Python DSPy Worker  │  ← reads raw_notes, writes entities
    │  (sidecar, Phase 2)  │  ← re-optimizes from corrections
    └─────────────────────┘

External integrations:
  Claude Code ──MCP──→ Hono API
  Slack Bot ──────────→ Hono API (capture_note)
  CLI Tool ───────────→ Hono API (capture_note)
  Apple Shortcuts ────→ Hono API (capture_note)
  Fireflies.ai ──────→ Hono API (capture_note)
```

### Authentication

**Decision: API keys.**

Simple, uniform auth that works across all clients:
- Web app: stores API key in localStorage after initial setup
- CLI tool: reads from env var or config file (`~/.pm/config`)
- MCP server: passed as env var to the MCP config
- Slack bot: uses a service API key

Implementation:
- Separate `api_keys` table: supports multiple keys per user, named keys (e.g., "cli", "slack-bot"), rotation, and revocation
- Generate a random API key, store the SHA-256 hash in `api_keys` with a name and user reference
- Hono middleware checks `Authorization: Bearer <key>` on every request
- Hash the incoming key, look up in `api_keys` where `revoked_at IS NULL`, track `last_used_at`
- Each client surface (CLI, Slack bot, MCP) gets its own named key for independent revocation

This is intentionally minimal. Can layer on session-based auth with login UI later if the tool grows beyond a small team.

### Monorepo Structure

Single repository for the entire project:

```
project-management/
├── packages/
│   ├── api/              # Hono API server
│   │   ├── src/
│   │   │   ├── db/       # Drizzle schema, migrations
│   │   │   ├── routes/   # Hono route handlers
│   │   │   ├── services/ # Business logic
│   │   │   ├── jobs/     # BullMQ job processors (extraction, etc.)
│   │   │   └── mcp/      # MCP tool definitions
│   │   └── package.json
│   ├── web/              # Vite + React frontend
│   │   ├── src/
│   │   │   ├── routes/   # TanStack Router file-based routes
│   │   │   ├── components/
│   │   │   ├── lib/      # API client, query keys
│   │   │   └── stores/   # Zustand stores
│   │   └── package.json
│   ├── cli/              # CLI capture tool
│   │   └── package.json
│   └── shared/           # Shared TypeScript types
│       ├── src/
│       │   ├── types.ts  # Entity types, API types
│       │   └── schemas.ts # Zod schemas (shared between API + web)
│       └── package.json
├── package.json          # Workspace root
└── docs/                 # Design docs (this file)
```

**Why monorepo:** Shared TypeScript types between frontend/backend/CLI. AI agents can see the full codebase. Single CI/CD pipeline. Package manager workspace (pnpm or npm workspaces) handles cross-package dependencies.

### MCP Tool Definitions

Tools exposed via `@modelcontextprotocol/hono`:

| Tool | Description | Use case |
|---|---|---|
| `capture_note` | Create a raw note (content, source, source_meta) | Agent captures a thought or finding |
| `list_projects` | List all active projects | Agent checks what's in flight |
| `get_project_dashboard` | Overview of a project (epics, task counts by status, recent decisions) | Agent gets context before starting work |
| `list_tasks` | Query tasks with filters (project, status, assignee, epic) | Agent finds what to work on |
| `pick_next_task` | Get the highest-priority unstarted task for a project | Agent asks "what should I do next?" |
| `update_task_status` | Change task status (e.g., in_progress, done) | Agent marks work as started/completed |
| `get_entity` | Get full details of a specific entity | Agent reads task details before implementation |
| `add_entity_comment` | Add a comment/note to an entity (stored in entity_events table, also tracks status changes and reprocessing) | Agent logs progress or findings |
| `list_review_queue` | Show pending review items | Agent or user checks what needs review |

### Session Tracking & Parallel Work

**Observation**: When using Claude Code, multiple features are often in-flight simultaneously (2-3 parallel sessions). Sessions can also evolve — starting on one feature and morphing into another.

**Current thinking**:
- Claude Code session history is stored per-project in `~/.claude/projects/`.
- Each session could map to a feature/task, but sessions aren't always 1:1 with features.
- Need a strategy for detecting when a session's scope shifts.

**Signals available for inference**:
- Claude Code session history (conversations)
- Git branch names
- Git commit messages
- Files touched in commits
- Explicit commands given at session start ("pick up task X")

---

## Assumptions

1. We will primarily use Claude Code for development, so session history is a reliable data source.
2. The user is willing to do a light review pass for low-confidence AI decisions.
3. Slack and Google Meet are the primary collaboration tools (for ingestion).
4. Projects are organized in a workspace directory structure that provides some signal for routing.
5. The system will be used by a small team initially (not enterprise-scale).

---

## Decisions Made

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | Sequence: Build Capture + AI Organizer first, design for Evolution Tracker later | Reduces scope while preserving future extensibility | 2026-02-07 |
| 2 | Build own data store rather than using an existing PM tool as system of record | Unique features (entity extraction, lineage, concept maps) need a custom data model | 2026-02-07 |
| 3 | Multiple entities can be extracted from a single raw note | A note can contain a task and a decision simultaneously | 2026-02-07 |
| 4 | Zero-annotation inference for project/feature routing | System should infer context from available signals, not require manual tagging | 2026-02-07 |
| 5 | Three entity types only: Task, Decision, Insight | Bug/feature/requirement are attributes of Task, not separate types. Idea collapsed into Insight. Reduces extraction complexity and noise. | 2026-02-07 |
| 6 | Minimal extraction principle: fewer, richer entities | Context/reasoning belongs as attributes within entities, not as separate entities. Prevents "entity explosion." | 2026-02-07 |
| 7 | Each entity type has common fields + flexible JSON attributes | Common fields (id, type, content, status, source, about, confidence) plus type-specific attributes in a JSON blob for extensibility | 2026-02-07 |
| 8 | Explicit typed relationships between entities | Relationships (derived_from, related_to, promoted_to) are first-class, not implicit. Required for future Evolution Tracker. | 2026-02-07 |
| 9 | PostgreSQL for data store, not Neo4j | Our graph is low fan-out, tree-shaped. Postgres recursive CTEs handle sub-10ms at our scale. Apache AGE as escape hatch if needed later. | 2026-02-07 |
| 10 | Phased AI extraction: TypeScript first, DSPy Python later | Phase 1: Claude API + Zod (TypeScript) for launch. Phase 2: DSPy Python sidecar when review queue has 20-50 corrections. Avoids premature Python complexity. | 2026-02-07 |
| 11 | All capture surfaces call a single `capture_note()` function | Uniform API layer ensures consistency regardless of source (CLI, Slack, Shortcuts, MCP). | 2026-02-07 |
| 12 | Expose system as MCP server for agent-native access | Claude Code and other agents can interact with capture + query tools natively. | 2026-02-07 |
| 13 | Full TypeScript stack (except Phase 2 DSPy worker) | Minimizes complexity, shared types across frontend/backend, agents write most code so language switching is fine for the DSPy sidecar. | 2026-02-07 |
| 14 | Hono for API framework | Best TypeScript DX, official MCP middleware, Zod-native, ~14KB, runtime-portable. Beats Express (outdated), Fastify (more boilerplate), tRPC (Python can't call it), NestJS (overkill). | 2026-02-07 |
| 15 | Drizzle ORM over Prisma | Typed JSONB (Prisma gives `any`), zero code-gen, 1.5MB vs 6.5MB, `drizzle-zod` bridge for single source of truth. | 2026-02-07 |
| 16 | Vite + React SPA for frontend (not Next.js) | Dashboard behind auth = no SSR benefit. Vite is simpler, faster, trivial PWA setup. TanStack Start upgrade path available if it hits 1.0. | 2026-02-07 |
| 17 | Progressive Web App via vite-plugin-pwa | Installable on mobile without building a native app. ~10 lines of config. | 2026-02-07 |
| 18 | TanStack ecosystem (Router, Query, Table) + shadcn/ui + Tailwind v4 | Type-safe URL params for filters, server state caching, headless tables, accessible UI components. Standard modern React dashboard stack. | 2026-02-07 |
| 19 | BullMQ + Redis for background jobs | Proven job queue for note processing pipeline. `@bull-board/hono` for monitoring dashboard. | 2026-02-07 |
| 20 | `duplicate_of` relationship + embedding similarity for dedup | Candidate duplicates detected via embedding search, surfaced in review queue for human confirmation. | 2026-02-07 |
| 21 | Epics are a first-class organizational concept, not an extracted entity type | Epics are intentional groupings (user-created or AI-suggested), not extracted from raw notes. Keeps the extraction pipeline focused on 3 types. | 2026-02-07 |
| 22 | Epic status is computed from children, not manually set | Eliminates status drift. Progress = done children / total children. | 2026-02-07 |
| 23 | One epic per entity (or none) | Keeps organization unambiguous. If something spans two epics, split it or pick the primary one. | 2026-02-07 |
| 24 | Two kinds of relationships: structural (FK) and graph (relationships table) | Project/epic/parent are singular → FKs. Provenance/lineage are many-to-many → relationships table. Clean separation of concerns. | 2026-02-07 |
| 25 | Task hierarchy via `parent_task_id` FK column | Tasks can have subtasks via a self-referencing FK. Combined with epic grouping, gives us: Epic → Tasks → Subtasks without needing separate "story" or "subtask" entity types. | 2026-02-07 |
| 26 | Two-phase AI processing: extraction then organization | Phase A extracts entities from raw notes. Phase B assigns projects, epics, duplicates, assignees. Separation of concerns = cleaner pipeline. | 2026-02-07 |
| 27 | Review UI is a single screen with AI suggestions | Shows low-confidence items with AI suggestions. User can accept, reassign, or add training comments. Comments feed back into DSPy optimization. | 2026-02-07 |
| 28 | Deploy on Render with `render.yaml` Infrastructure as Code | All infrastructure defined in `render.yaml` — zero manual creation in the Render dashboard. Web service, background worker, Postgres, Redis, static site, cron jobs all declared in code. Render over Supabase because we need Postgres + Redis + web server + workers + cron in one platform; Supabase's managed auth/realtime/REST layers go unused since we built our own. | 2026-02-07 |
| 29 | Task `assignee_id` as a first-class FK column | Entities have an `assignee_id` FK to `users`. The AI extracts a raw name string (e.g., "Sarah") into `attributes.owner`; the application layer resolves it to `assignee_id`. | 2026-02-07 |
| 30 | API key authentication via `api_keys` table | Separate `api_keys` table supports multiple named keys per user, rotation, revocation, and last-used tracking. Hono middleware checks `Authorization: Bearer <key>`. Can layer on sessions later if needed. | 2026-02-07 |
| 31 | Monorepo structure | Single repo for frontend + backend + CLI + shared types. Easier for AI agents to work with, shared TypeScript types across packages. | 2026-02-07 |
| 32 | MCP tools: basic CRUD + agent workflow | capture_note, list_projects, get_project_dashboard, list_tasks, pick_next_task, update_task_status. Enough for Claude Code to interact with the system. | 2026-02-07 |
| 33 | Field-level confidence via `ai_meta` JSONB | Entities store per-field confidence scores, model info, and extraction metadata in an `ai_meta` JSONB column. Enables precise review queue items (e.g., low confidence only on project assignment). | 2026-02-07 |
| 34 | Evidence/source quotes via `evidence` JSONB | Entities store extracted source quotes with raw_note_id, text snippet, and optional char offsets in an `evidence` JSONB column. Prevents hallucination by linking claims to source text. | 2026-02-07 |
| 35 | Entity events table for comments, status changes, and reprocessing | Append-only `entity_events` table backs the `add_entity_comment` MCP tool and provides audit trail for status transitions and reprocessing runs. | 2026-02-07 |
| 36 | Idempotent raw note ingestion via `external_id` | `raw_notes.external_id` with unique constraint on `(source, external_id)` prevents duplicate ingestion from Slack retries, webhook replays, etc. | 2026-02-07 |
| 37 | Provenance via `entity_sources`, not `entity_relationships` | Entity-to-raw-note provenance uses the `entity_sources` join table (bidirectionally indexed). `entity_relationships` is strictly entity-to-entity for graph traversal. | 2026-02-07 |
| 38 | Review queue supports non-entity suggestions | `review_queue.entity_id` is nullable; `project_id` added for project-scoped suggestions like epic creation. CHECK constraint ensures at least one subject. | 2026-02-07 |
| 39 | Dark industrial design system for frontend | Industrial-utilitarian dark theme: `#0C0E14` base, Bricolage Grotesque + DM Sans + JetBrains Mono typography, entity-type color coding (amber tasks, blue decisions, emerald insights), confidence spectrum (green/amber/red). See `mockups/` for reference implementations. | 2026-02-07 |
| 40 | Render infrastructure strictly via `render.yaml` | Zero manual creation in Render dashboard. All services (web, worker, static site), databases (Postgres, Redis), and cron jobs declared in `render.yaml`. This is a core principle, not optional. | 2026-02-07 |
| 41 | 8-phase implementation plan with MVP = Phases 1-4 | Phase 1: Foundation, Phase 2: Capture Pipeline, Phase 3: Review Queue + CLI, Phase 4: Web Frontend. MVP delivers end-to-end flow via CLI and web. v1.0 adds MCP, Slack, PWA (Phases 5-7). v1.1 adds DSPy (Phase 8). | 2026-02-07 |
| 42 | Vitest + testcontainers for testing | Vitest for all packages (shares Vite config, ESM-native). Testcontainers for real Postgres in CI. Playwright for E2E on critical paths only. AI extraction tested via fixture-based schema validation (every PR) + real Claude API calls (nightly). | 2026-02-07 |
| 43 | Auth middleware: SHA-256 + CLI seed + `pm_live_` key prefix | API keys hashed with SHA-256 + pepper. CLI seed command (`pnpm db:seed`) for bootstrapping first user + key. Key format: `pm_live_<32 hex chars>` for easy leak detection. Non-blocking `last_used_at` update. | 2026-02-07 |
| 44 | Standard error envelope + Pino logging + 2-tier rate limiting | All errors return `{ error: { code, message, status, details?, requestId? } }`. Pino for structured JSON logging. Tier 1: IP-based brute-force protection (15min/20 attempts). Tier 2: API-key-based capture spam protection (1min/30 requests). | 2026-02-07 |
| 45 | 9 MCP tools wrapping API endpoints | `capture_note`, `list_projects`, `get_project_dashboard`, `list_tasks`, `pick_next_task`, `update_task_status`, `get_entity`, `add_entity_comment`, `list_review_queue`. Full Zod input/output schemas defined. | 2026-02-07 |

---

## Options Explored

### Data Store
| Option | Verdict | Rationale |
|---|---|---|
| Neo4j (dedicated graph DB) | Rejected | Overkill for our scale, adds operational complexity, niche skill set, vendor lock-in risk |
| PostgreSQL + recursive CTEs | **Selected** | Battle-tested, sub-10ms at our scale, universal tooling, every framework supports it |
| PostgreSQL + Apache AGE | Reserved as escape hatch | Adds Cypher query support to Postgres if recursive CTEs become limiting |
| SQLite | Considered for MVP | Simpler but single-writer; if we're using Postgres for entities, keep raw_notes there too |

### AI Extraction
| Option | Verdict | Rationale |
|---|---|---|
| Claude API + Zod (TypeScript) | **Selected (Phase 1)** | Keeps stack in one language for launch. Zod validates `tool_use` structured output. |
| DSPy Python worker | **Selected (Phase 2)** | Self-improving extraction from human corrections. Introduce when review queue has 20-50 examples. |
| Instructor (Python, Pydantic) | Deferred | Equivalent to Zod approach but in Python. Not needed unless we go Python-first. |
| Raw prompt engineering | Rejected | No type validation, inconsistent output structure, harder to iterate |
| Existing tools (Fireflies, Notion AI) | Supplementary | Fireflies pre-extracts action items from meetings — useful as first pass, but can't replace our custom pipeline |

### API Framework
| Option | Verdict | Rationale |
|---|---|---|
| Hono | **Selected** | Best TypeScript DX, official MCP middleware (`@modelcontextprotocol/hono`), first-class Zod validation, ~14KB, runs on any JS runtime |
| Fastify | Strong alternative | More mature plugin ecosystem, but more Zod setup boilerplate, no official MCP middleware |
| Express | Rejected | Worst TypeScript DX, slowest performance, no advantage for greenfield projects |
| tRPC | Eliminated | Python DSPy worker can't call tRPC endpoints. TypeScript-only on both ends. |
| Elysia | Rejected | Bun-only lock-in, smaller community (~10K stars vs Hono's ~28K), no MCP middleware |
| NestJS | Rejected | Decorator-heavy enterprise framework, overkill for 1-2 devs, AI agents produce verbose code with it |

### ORM / Database Access
| Option | Verdict | Rationale |
|---|---|---|
| Drizzle ORM | **Selected** | Typed JSONB, zero code-gen, 1.5MB bundle, `drizzle-zod` generates validation schemas from DB tables |
| Prisma | Rejected | JSONB = `any` type, requires `prisma generate`, 6.5MB + Rust binary, schema duplication |
| Kysely | Considered | Great query builder but no ORM features (relations, schema migrations), more verbose for CRUD, no Zod bridge |
| Raw pg | Fallback | Always available for complex queries Drizzle can't express, but not primary access pattern |

### Frontend Framework
| Option | Verdict | Rationale |
|---|---|---|
| Vite + React SPA | **Selected** | Simplest for dashboard behind auth, best PWA support, fastest DX |
| TanStack Start | Reserved | Built on same TanStack Router — easy migration when it reaches 1.0 stable |
| Next.js (App Router) | Rejected | SSR complexity not needed for authenticated dashboard, harder PWA (requires Serwist + Webpack fallback) |
| Remix / React Router v7 | Rejected | Ecosystem in transition, loader/action pattern adds ceremony vs TanStack Query for CRUD |

### Quick Capture
| Option | Verdict | Rationale |
|---|---|---|
| CLI tool | **Selected (P0)** | Lowest friction for devs, 1 day to build, immediately agent-native |
| Slack bot (slash + emoji) | **Selected (P0)** | Covers team communication, emoji reaction = capture any message |
| Apple Shortcuts (text + voice) | **Selected (P1)** | Mobile capture without building an app, Whisper API for voice |
| MCP server | **Selected (P1)** | Makes entire system accessible to Claude Code and other AI agents |
| Fireflies.ai integration | **Selected (P2)** | Meeting transcripts with pre-extracted entities |
| Browser extension | Deferred | Higher effort, lower marginal value vs. Shortcuts |
| Telegram bot | Deferred | Only if Telegram becomes primary communication tool |

### Authentication
| Option | Verdict | Rationale |
|---|---|---|
| API keys | **Selected** | Simplest. Works uniformly across web, CLI, MCP, Slack bot. One middleware for all clients. |
| Session cookies | Deferred | Better UX for web app login, but doesn't help CLI/MCP. Can add later. |
| JWT | Rejected | More complex than API keys for same benefit at this scale. Revocation is harder. |
| OAuth (Google) | Deferred | Nice for SSO but unnecessary for a small team internal tool. Add when/if multi-tenant. |

---

## API Route Design

Key constraint: every client (web, CLI, Slack bot, MCP) calls the same HTTP API. MCP tools are a thin wrapper over these endpoints. The web app uses Hono RPC (`hc`) against the same routes.

Conventions:
- Base path: `/api`
- Auth: `Authorization: Bearer <api_key>` on all routes unless noted.
- Responses return DB-shaped objects (validated by the corresponding `*SelectSchema` from `drizzle-zod`), plus small envelopes for lists/actions.
- List endpoints are cursor-paginated: `limit` (default 50, max 200), `cursor` (opaque string), response `{ items, nextCursor }`.

### Notes

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `POST /api/notes/capture` | Unified `capture_note` endpoint. Creates a raw note and enqueues extraction. Idempotent via `(source, external_id)` when provided. | `captureNoteSchema = rawNoteInsertSchema.pick({ content, source, sourceMeta, capturedAt, externalId })` | `201 { note: rawNoteSelectSchema, deduped: false }` or `200 { note, deduped: true }` | CLI, Slack bot, Web app, MCP |
| `GET /api/notes` | Admin/debug listing of raw notes (processing visibility). | Query: `{ processed?: boolean, source?: note_source, capturedBy?: uuid, since?: ISO, until?: ISO, limit?, cursor? }` | `{ items: rawNoteSelectSchema[], nextCursor }` | Web app (admin), MCP |
| `POST /api/notes/:id/reprocess` | Force reprocess a raw note (creates a reprocess trail event and enqueues extraction again). | Params: `id` (uuid) | `202 { ok: true }` | Web app, MCP |

Notes:
- `POST /api/notes/capture` is the only supported write path for ingesting external content (Slack, transcripts, sessions) at launch.
- Processing state remains source-of-truth on `raw_notes` (`processed`, `processed_at`, `processing_error`); BullMQ is orchestration.

### Entities

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/entities` | List entities with filters for dashboards and agents. | Query: `{ projectId?: uuid, epicId?: uuid, type?: entity_type, status?: string, assigneeId?: uuid, tagId?: uuid, includeDeleted?: boolean, limit?, cursor? }` | `{ items: entitySelectSchema[], nextCursor }` | Web app, CLI, MCP |
| `GET /api/entities/:id` | Get full entity record. | Params: `id` | `{ entity: entitySelectSchema }` | Web app, CLI, MCP |
| `PATCH /api/entities/:id` | Update editable fields (status, assignment, content, attributes). | Body: `entityPatchSchema` — subset of `entityInsertSchema` + `entityWithAttributesSchema` for attributes validation; allow `status`, `projectId`, `epicId`, `assigneeId`, `content`, `attributes` | `{ entity: entitySelectSchema }` | Web app, CLI, MCP |
| `POST /api/entities` | Manual create (rare). Also used for "promote insight to task" if you choose create-new over type-change. | `entityInsertSchema` + `entityWithAttributesSchema` | `{ entity: entitySelectSchema }` | Web app, MCP |
| `GET /api/entities/:id/events` | Fetch entity audit trail (comments/status changes/reprocess). | Query: `{ limit?, cursor? }` | `{ items: entityEventSelectSchema[], nextCursor }` | Web app, MCP |
| `POST /api/entities/:id/events` | Add comment (backs `add_entity_comment`). | Body: `entityEventInsertSchema` constrained to `{ type: 'comment', body: string }` + optional `meta` | `{ event: entityEventSelectSchema }` | Web app, CLI, MCP |
| `POST /api/entities/:id/status` | Convenience: status transition + event creation atomically. | Body: `{ newStatus: string }` | `{ entity: entitySelectSchema }` | CLI, MCP, Web app |

### Projects

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/projects` | List active projects. | Query: `{ status?: project_status, includeDeleted?: boolean }` | `{ items: projectSelectSchema[] }` | Web app, CLI, MCP |
| `POST /api/projects` | Create project. | `projectInsertSchema` | `{ project: projectSelectSchema }` | Web app, MCP |
| `PATCH /api/projects/:id` | Update project (name/description/status). | Body: subset of `projectInsertSchema` | `{ project: projectSelectSchema }` | Web app, MCP |
| `GET /api/projects/:id/dashboard` | Aggregated dashboard view (counts + recent). | Query: `{ since?: ISO }` | `{ project, stats: { tasksByStatus, openDecisions, recentInsights }, epics: EpicSummary[], recentEntities: entitySelectSchema[] }` | Web app, MCP |

### Epics

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/epics` | List epics (usually filtered by project). | Query: `{ projectId: uuid, includeDeleted?: boolean }` | `{ items: epicSelectSchema[] }` | Web app, MCP |
| `POST /api/epics` | Create epic (user-created or accepted epic suggestion). | `epicInsertSchema` | `{ epic: epicSelectSchema }` | Web app, MCP |
| `PATCH /api/epics/:id` | Update epic (name/description). | Body: subset of `epicInsertSchema` | `{ epic: epicSelectSchema }` | Web app, MCP |

### Review Queue

Supports entity-scoped review items (`entity_id`) and project-scoped suggestions (`project_id`, e.g. `epic_creation`).

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/review-queue` | List review items for UI/agents. | Query: `{ status?: review_status, projectId?: uuid, entityId?: uuid, reviewType?: review_type, limit?, cursor? }` | `{ items: reviewQueueSelectSchema[], nextCursor }` | Web app, MCP |
| `POST /api/review-queue/:id/resolve` | Resolve a single review item (accepted/rejected/modified). Applies writes atomically. | Body: `reviewResolveSchema` — `{ status: 'accepted'\|'rejected'\|'modified', userResolution?: ReviewSuggestion, trainingComment?: string }` | `{ item: reviewQueueSelectSchema, effects: ResolveEffects }` | Web app, MCP |
| `POST /api/review-queue/resolve-batch` | Batch resolution for UI speed. | Body: `{ resolutions: Array<{ id, status, userResolution?, trainingComment? }> }` | `{ items: reviewQueueSelectSchema[] }` | Web app |

### Tags

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/tags` | List tags (global). | Query: `{ q?: string }` | `{ items: tagSelectSchema[] }` | Web app, MCP |
| `POST /api/tags` | Create tag. | `tagInsertSchema` | `{ tag: tagSelectSchema }` | Web app, MCP |
| `PUT /api/entities/:id/tags` | Replace entity tags (simple UI semantics). | Body: `{ tagIds: uuid[] }` | `{ entityId: uuid, tagIds: uuid[] }` | Web app, MCP |

### Users / Auth

| Method + Path | Purpose | Request (Zod) | Response | Surfaces |
|---|---|---|---|---|
| `GET /api/auth/me` | Validate key and get current user. | None | `{ user: userSelectSchema }` | Web app, CLI, MCP |
| `POST /api/auth/api-keys` | Create a new API key (returns plaintext once). | Body: `{ name: string }` | `{ apiKey: { id, name, createdAt }, plaintextKey: string }` | Web app |
| `GET /api/auth/api-keys` | List API keys (no plaintext). | None | `{ items: apiKeySelectSchema[] }` | Web app |
| `POST /api/auth/api-keys/:id/revoke` | Revoke key. | Params: `id` | `{ ok: true }` | Web app |
| `GET /api/users` | List users for assignee UI. | Query: `{ q?: string }` | `{ items: userSelectSchema[] }` | Web app, MCP |
| `POST /api/users` | Create user (admin-only). | `userInsertSchema` | `{ user: userSelectSchema }` | Web app |

### SSE (Server-Sent Events)

| Method + Path | Purpose | Events |
|---|---|---|
| `GET /api/sse` | Single SSE connection per authenticated client. Streams real-time updates. | `review_queue:created`, `review_queue:resolved`, `entity:created`, `entity:updated`, `entity:event_added`, `raw_note:processed`, `project:stats_updated` |

---

## Review Workflow Specification

### What Triggers Review Queue Items

Review items are created during processing whenever an AI-produced field is below threshold or requires human judgment. Primary triggers:

1. **Low field confidence**
   - Source: `entities.ai_meta.fieldConfidence`
   - Example: `projectId` confidence < 0.9 creates `review_type = project_assignment`
   - Example: `type` confidence < 0.9 creates `review_type = type_classification`
   - Example: `assigneeId` confidence < 0.9 creates `review_type = assignee_suggestion`

2. **Uncertain routing**
   - `project_assignment`: model proposes `suggestedProjectId` but low confidence or multiple close candidates.
   - `epic_assignment`: model proposes `suggestedEpicId` but low confidence.

3. **Potential duplicate**
   - `duplicate_detection`: embedding similarity above threshold (plus heuristics like temporal proximity).
   - `ai_suggestion.duplicateEntityId` + `similarityScore` recorded.

4. **AI-suggested epic creation**
   - `review_type = epic_creation`
   - Project-scoped item with `project_id` set.
   - `ai_suggestion` includes `proposedEpicName`, `proposedEpicDescription`, and evidence references.

5. **Generic low-confidence fallback**
   - `review_type = low_confidence` when the system knows "something is off" but can't map cleanly to a typed field (should be rare; prefer specific types).

### Review Item Lifecycle

- **Creation**: `status='pending'`, set `ai_suggestion`, `ai_confidence`, set subject (`entity_id` or `project_id`).
- **Resolution**: one of:
  - `accepted`: apply `ai_suggestion` as-is
  - `rejected`: do not apply suggestion; keep existing values (or null)
  - `modified`: apply `user_resolution` instead
- **After resolution**: set `resolved_by`, `resolved_at`, optional `training_comment`, and persist `user_resolution` (especially for `modified`).

### Resolution Semantics (What Writes Happen)

All resolutions are atomic in a DB transaction: update review item + apply effects + append `entity_events` entries (where applicable).

Mapping by `review_type`:

- **`type_classification`** (entity-scoped)
  - accepted: update `entities.type`, reset `status` to valid default for new type (`task=captured`, `decision=pending`, `insight=captured`), validate/clear `attributes` if incompatible, write `entity_events`
  - rejected: keep existing `type`; no entity change
  - modified: set `type` to `user_resolution.suggestedType` + same normalization

- **`project_assignment`** (entity-scoped)
  - accepted: set `entities.project_id = ai_suggestion.suggestedProjectId`
  - rejected: leave as-is (often null); entity remains "unassigned"
  - modified: set `entities.project_id = user_resolution.suggestedProjectId`

- **`epic_assignment`** (entity-scoped)
  - accepted: set `entities.epic_id`
  - rejected: keep existing
  - modified: set `entities.epic_id` to user choice

- **`assignee_suggestion`** (entity-scoped)
  - accepted: set `entities.assignee_id`
  - rejected: leave null/unchanged; preserve raw name in `attributes.owner`
  - modified: set `entities.assignee_id` to user choice

- **`duplicate_detection`** (entity-scoped)
  - accepted: create `entity_relationships` edge `duplicate_of (entity → duplicateEntityId)` with metadata (score, reason)
  - rejected: no edge created
  - modified: create edge to `user_resolution.duplicateEntityId`

- **`epic_creation`** (project-scoped)
  - accepted: create `epics` row (created_by=`ai_suggestion`) and optionally create follow-up `epic_assignment` review items for candidate entities
  - rejected: do nothing
  - modified: create epic using user-provided name/description

### Training Comment → DSPy Feedback Loop

Training data is generated from resolved review items that include a `training_comment` and/or represent a correction (`status in ('rejected','modified')`).

A nightly (or on-demand) export job produces JSONL examples containing:
- **Inputs**: `raw_notes.content` for all linked notes (`entity_sources`), entity snapshot before resolution, `ai_suggestion` + `ai_confidence` + `ai_meta` (model/promptVersion)
- **Outputs**: the resolved "correct" value (either `ai_suggestion` if accepted, or `user_resolution`/implicit null if rejected), `training_comment` as free-form rationale

DSPy worker consumes these to optimize prompts/few-shot examples.

### Review UI Batching Order

Default batching order (optimized for low cognitive load and correctness):

1. **By project**
2. Within a project, **by entity** (show entity header once, then all pending items)
3. Within an entity, resolve in dependency order:
   - `type_classification` first (can invalidate other assumptions)
   - `project_assignment`
   - `epic_assignment`
   - `assignee_suggestion`
   - `duplicate_detection`

Project-scoped items (like `epic_creation`) appear in the same project queue but outside entity groups.

### Edge Case: Entity Type Change During Review

Scenario: raw note produces an entity and a pending `type_classification` review item; user changes type.

Required behavior:
- Apply type change with normalization: set valid status for new type (to satisfy DB CHECK constraints), re-validate attributes, record old value in `entity_events.meta` snapshot
- Reconcile other pending review items for the entity: mark now-nonsensical items as `rejected` with automatic system resolution
- If type changes from `task` to `insight` and the entity was assigned to an epic, keep the epic assignment (the model allows any entity to belong to an epic)

---

## BullMQ Job Definitions

Naming convention: `<domain>:<action>`. Each job payload includes a stable id (`rawNoteId`, `entityId`, etc.) and is idempotent at the DB layer where possible.

### Core Pipeline Jobs

| Job Name | Trigger | What It Does | Retry Policy | Dependencies |
|---|---|---|---|---|
| `notes:extract` | Enqueued by `POST /api/notes/capture` and by scheduled "scan unprocessed notes" | Loads `raw_notes`, calls Claude extraction tool with Zod validation, writes: `entities`, `entity_sources`, `entity_events`, sets `raw_notes.processed=true` and `processed_at`, or sets `processing_error` | 5 attempts, exponential backoff, jitter; do not retry on deterministic Zod mismatch after N tries | none |
| `entities:organize` | Enqueued after successful `notes:extract` (per raw note or per entity) | Phase B: project/epic routing, assignee suggestion, duplicate candidate discovery; writes entity assignments + `review_queue` items | 5 attempts, exponential backoff | waits for extraction |
| `entities:compute-embeddings` | Enqueued when an entity is created/updated (content change) | Computes embedding vector (if/when pgvector added) and stores it, enabling fast duplicate candidate search | 3 attempts, backoff | after extraction; can run async from organize |
| `review-queue:export-training-data` | Nightly cron or manual admin endpoint | Exports resolved review items (with training comments/corrections) to JSONL for DSPy | 3 attempts | none |
| `notes:reprocess` | Enqueued by `POST /api/notes/:id/reprocess` | Clears `processing_error`, resets `processed=false`, appends `entity_events(type='reprocess')`, re-enqueues `notes:extract` | 3 attempts | none |

### Error Handling and Partial Failures

- Treat a raw note as the unit of work.
- Run extraction + DB writes in a single transaction:
  - If any extracted entity fails validation/insertion, roll back and mark `raw_notes.processing_error` (and keep `processed=false`).
  - This avoids "half-ingested" notes that are painful to reprocess idempotently.
- After final failure (exhaust retries):
  - Keep the raw note for audit.
  - Surface processing errors in an admin view (`GET /api/notes?processed=false` plus `processing_error`).

### Organization vs Extraction Dependency

- Organization should not run until extraction completes, but it does not need to block ingestion.
- Enqueue `entities:organize` at the end of `notes:extract` using the list of newly created entity IDs.

### Claude Code Session History Processing

**Recommendation: server-side processing with explicit client upload (not automatic).**

- Implement a CLI command (and MCP tool) that reads session files locally and uploads them via the existing `POST /api/notes/capture` endpoint as `source='claude_session'` with `external_id` and rich `source_meta` (session id, project path hash, git branch).
- Add client-side optional redaction filters before upload (at minimum: strip obvious API keys/tokens via regex, and allow user-defined denylist patterns).
- Do not build a background "watch and continuously upload" daemon at first. Start with a manual "sync sessions since X" to reduce accidental data leakage.
- This keeps the server as the single brain for extraction/organization/review while keeping the ingestion surface aligned with the unified capture API.

---

## Implementation Plan

### Build Order (Phased)

#### Phase 1 — Foundation: Monorepo, Schema, Auth, and Deploy Skeleton

**Goal:** Stand up the monorepo, Postgres schema, API server with auth middleware, a single seed endpoint, and deploy to Render — so every subsequent phase auto-deploys.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **Root** | `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore`, `render.yaml` (Postgres, Redis, web service for API, static site for web) |
| **packages/shared** | `src/types.ts` (all JSONB TS types: `TaskAttributes`, `DecisionAttributes`, `InsightAttributes`, `EntityAiMeta`, `EntityEvidence`, `ReviewSuggestion`, `SourceMeta` variants, `RelationshipMeta`, `EntityEventMeta`), `src/schemas.ts` (Zod schemas for all JSONB shapes, `entityWithAttributesSchema` discriminated union, `captureNoteSchema`, `reviewResolveSchema`), `src/constants.ts` (status enums, entity types, confidence thresholds), `package.json`, `tsconfig.json` |
| **packages/api** | `src/db/schema/` — all 12 Drizzle table files (`enums.ts`, `users.ts`, `projects.ts`, `epics.ts`, `entities.ts`, `raw-notes.ts`, `entity-sources.ts`, `entity-relationships.ts`, `tags.ts`, `entity-tags.ts`, `review-queue.ts`, `entity-events.ts`, `api-keys.ts`, `relations.ts`, `types.ts` re-exported from shared, barrel `index.ts`), `drizzle.config.ts`, first migration (full schema + `updated_at` trigger + `get_entity_lineage` function), `src/db/index.ts` (Drizzle client + connection), `src/index.ts` (Hono app entrypoint), `src/middleware/auth.ts` (API key bearer token middleware: hash incoming key, look up in `api_keys`, set `c.set('user', ...)`, update `last_used_at`), `src/routes/auth.ts` (`GET /api/auth/me`, `POST /api/auth/api-keys`, `GET /api/auth/api-keys`, `POST /api/auth/api-keys/:id/revoke`), `src/routes/users.ts` (`GET /api/users`, `POST /api/users`), `src/services/auth.ts` (key generation, hashing, validation), seed script (`scripts/seed.ts`: create initial user + first API key, print plaintext key) |

**Endpoints delivered:**
- `GET /api/auth/me`
- `POST /api/auth/api-keys` / `GET /api/auth/api-keys` / `POST /api/auth/api-keys/:id/revoke`
- `GET /api/users` / `POST /api/users`
- `GET /api/health` (unauthenticated, for Render health checks)

**Dependencies:** None (first phase).

**Done checkpoint:**
1. `pnpm install` succeeds across all workspaces.
2. `pnpm --filter api db:push` (or `drizzle-kit migrate`) applies the full schema to a local Postgres.
3. `pnpm --filter api seed` creates a user + API key and prints the plaintext key.
4. `curl -H "Authorization: Bearer <key>" http://localhost:3000/api/auth/me` returns the user.
5. `render.yaml` is committed; manual first deploy to Render succeeds; health check passes on the deployed URL.
6. All subsequent pushes to main trigger automatic deploys.

**Complexity:** L (most boilerplate — monorepo wiring, schema, migrations, auth middleware, Render config)

---

#### Phase 2 — Capture Pipeline: Notes, Projects, and BullMQ Extraction

**Goal:** Data flows in. A note captured via the API is persisted, processed by Claude into entities, and stored with provenance links. This is the core vertical slice — capture to entities.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/api** | `src/routes/notes.ts` (`POST /api/notes/capture`, `GET /api/notes`, `POST /api/notes/:id/reprocess`), `src/routes/projects.ts` (`GET /api/projects`, `POST /api/projects`, `PATCH /api/projects/:id`, `GET /api/projects/:id/dashboard`), `src/routes/epics.ts` (`GET /api/epics`, `POST /api/epics`, `PATCH /api/epics/:id`), `src/routes/entities.ts` (`GET /api/entities`, `GET /api/entities/:id`, `PATCH /api/entities/:id`, `POST /api/entities`, `GET /api/entities/:id/events`, `POST /api/entities/:id/events`, `POST /api/entities/:id/status`), `src/services/capture.ts` (idempotent note creation via `(source, external_id)` upsert, enqueue `notes:extract`), `src/services/entities.ts` (CRUD, status transition with event logging), `src/services/projects.ts` (CRUD, dashboard aggregation query), `src/jobs/queue.ts` (BullMQ queue + worker setup, Redis connection), `src/jobs/notes-extract.ts` (`notes:extract` job), `src/jobs/entities-organize.ts` (`entities:organize` job), `src/ai/extraction.ts` (Claude API call with entity extraction Zod schemas, few-shot examples), `src/ai/organization.ts` (Claude API call for project/epic routing) |
| **packages/shared** | Add `captureNoteSchema` refinements, entity filter query schema, BullMQ job type definitions |
| **render.yaml** | Add Redis service, add background worker service (same codebase, different start command: `pnpm --filter api worker`) |

**Endpoints delivered:**
- `POST /api/notes/capture` (the unified capture endpoint)
- `GET /api/notes` / `POST /api/notes/:id/reprocess`
- Full CRUD: `/api/projects`, `/api/epics`, `/api/entities` (all endpoints from API Route Design)

**BullMQ jobs delivered:**
- `notes:extract` (Phase A extraction)
- `entities:organize` (Phase B organization)
- `notes:reprocess`

**Dependencies:** Phase 1 (schema, auth, monorepo, deploy)

**Done checkpoint:**
1. `curl -X POST /api/notes/capture -d '{"content":"We decided to use React for the dashboard. Sarah will build the auth flow.","source":"cli"}' -H "Authorization: Bearer <key>"` returns `201` with the raw note.
2. Within seconds, `GET /api/entities` returns two entities: a decision ("Use React for dashboard") and a task ("Build auth flow", `attributes.owner: "Sarah"`).
3. `GET /api/notes?processed=false` returns empty (the note was processed).
4. Duplicate `POST` with same `source + externalId` returns `200` with `deduped: true`.
5. Entities with low AI confidence have corresponding items in the review_queue table.
6. `GET /api/projects/:id/dashboard` returns stats with entity counts.

**Complexity:** L (Claude integration, BullMQ setup, transactional extraction pipeline, two-phase AI processing)

---

#### Phase 3 — Review Queue + CLI: Operational Workflow

**Goal:** The review queue is functional end-to-end (API + resolution semantics), and the CLI exists for dogfooding capture and basic queries. The system is now *usable* for real work.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/api** | `src/routes/review-queue.ts` (`GET /api/review-queue`, `POST /api/review-queue/:id/resolve`, `POST /api/review-queue/resolve-batch`), `src/services/review.ts` (resolution logic per `review_type`: atomic transaction to update review item + apply entity writes + append entity_events; handles type_classification normalization, project/epic/assignee assignment, duplicate_of edge creation, epic_creation; reconciles other pending review items on type change), `src/routes/tags.ts` (`GET /api/tags`, `POST /api/tags`, `PUT /api/entities/:id/tags`) |
| **packages/cli** | `src/index.ts` (CLI entrypoint using `commander` or `citty`), commands: `pm capture "<text>"`, `pm projects`, `pm tasks [--project <id>] [--status <s>]`, `pm status <entity-id> <new-status>`, `pm review` (interactive accept/reject/modify), `pm config` (set API URL + key, stored in `~/.pm/config.json`), `package.json` with `bin` field for global install |
| **packages/shared** | `reviewResolveSchema`, review resolution effect types |

**Endpoints delivered:**
- `GET /api/review-queue` / `POST /api/review-queue/:id/resolve` / `POST /api/review-queue/resolve-batch`
- `GET /api/tags` / `POST /api/tags` / `PUT /api/entities/:id/tags`

**CLI commands delivered:**
- `pm capture`, `pm projects`, `pm tasks`, `pm status`, `pm review`, `pm config`

**Dependencies:** Phase 2 (entities + review_queue must be populated by the extraction pipeline)

**Done checkpoint:**
1. After Phase 2 extraction produces low-confidence items, `pm review` shows pending items with AI suggestions.
2. `pm review` accept on a project_assignment item updates the entity's `project_id` in the database.
3. `pm review` modify on a type_classification item changes the entity type, resets status to the correct default, and auto-rejects any now-nonsensical pending reviews for that entity.
4. `pm capture "Add dark mode toggle to settings"` from the terminal creates a raw note and triggers extraction.
5. `pm tasks --project <id>` lists tasks for a project.
6. Batch resolve via API resolves multiple items atomically.
7. CLI is installable via `pnpm --filter cli build && npm link`.

**Complexity:** M (review resolution logic is the hardest part — edge cases around type changes and cascading review item invalidation; CLI itself is straightforward)

---

#### Phase 4 — Web Frontend: Review Queue + Project Dashboard

**Goal:** The primary web interface is live — the review queue (most critical operational view) and the project dashboard. Dark industrial design system applied.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/web** | `package.json`, `vite.config.ts`, `tailwind.config.ts` (Tailwind v4 with `#0C0E14` base, entity-type color tokens: amber/blue/emerald, confidence spectrum tokens), `src/main.tsx`, `src/app.tsx` (TanStack Router root), `src/lib/api-client.ts` (Hono RPC `hc` client), `src/lib/query-keys.ts` (TanStack Query key factory), `src/stores/ui.ts` (Zustand: sidebar, modals, theme), **Design system:** `src/components/ui/` (shadcn/ui customized for dark industrial theme), `src/components/layout/` (AppShell, Sidebar, Header), **Fonts:** Bricolage Grotesque (headings), DM Sans (body), JetBrains Mono (code/IDs/confidence), **Routes:** `src/routes/index.tsx`, `src/routes/review.tsx`, `src/routes/projects.tsx`, `src/routes/projects.$projectId.tsx`, `src/routes/entities.$entityId.tsx`, **Components:** `ReviewCard.tsx`, `EntityRow.tsx`, `ProjectCard.tsx`, `EpicProgress.tsx`, `ConfidenceBadge.tsx`, `TypeBadge.tsx` |
| **packages/api** | `src/routes/sse.ts` (`GET /api/sse` — SSE endpoint streaming real-time events), `src/services/events.ts` (SSE event bus using Node EventEmitter or Redis pub/sub) |
| **render.yaml** | Add static site service for web frontend (build command: `pnpm --filter web build`, publish path: `packages/web/dist`) |

**Dependencies:** Phase 3 (review queue API endpoints, full entity CRUD, tags)

**Done checkpoint:**
1. `pnpm --filter web dev` starts the frontend at `localhost:5173`.
2. Review queue page shows pending items grouped by project, with entity content, AI suggestion, and confidence badge.
3. Accepting a review item updates the entity and removes it from the pending list (via SSE or query refetch).
4. Project dashboard shows all projects with summary stats; clicking a project shows its epics, entities, and filters.
5. Entity detail page shows content, attributes, evidence quotes, and event timeline.
6. Dark industrial theme is applied: `#0C0E14` background, correct fonts, entity type colors.
7. Static site deploys to Render and is accessible at the configured URL.

**Complexity:** L (largest phase by file count — design system setup, multiple routes, TanStack Query integration, SSE client, responsive layout)

---

#### Phase 5 — MCP Server + Quick Capture UX

**Goal:** The system is agent-native. Claude Code (and other MCP clients) can capture notes, query projects/tasks, pick next tasks, and update statuses. The web app gets a quick-capture modal.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/api** | `src/mcp/server.ts` (MCP server setup using `@modelcontextprotocol/sdk` + `@modelcontextprotocol/hono`), 9 MCP tool files in `src/mcp/tools/` wrapping API endpoints: `capture-note.ts`, `list-projects.ts`, `get-project-dashboard.ts`, `list-tasks.ts`, `pick-next-task.ts`, `update-task-status.ts`, `get-entity.ts`, `add-entity-comment.ts`, `list-review-queue.ts` |
| **packages/web** | `src/components/QuickCapture.tsx` (floating action button or `Cmd+K` modal), capture shortcut in header/sidebar |
| **packages/cli** | `pm session-sync` command (reads Claude Code session files, uploads via capture API with dedup) |
| **docs/** | `mcp-config-example.json` |

**Dependencies:** Phase 3 (all API endpoints MCP wraps must exist)

**Done checkpoint:**
1. Add MCP server config to Claude Code's settings and restart.
2. In Claude Code: "Capture a note: we need to add rate limiting to the API" — the tool executes and returns the created note.
3. In Claude Code: "Pick my next task on project X" — `pick_next_task` returns the highest-priority unstarted task.
4. On the web app, `Cmd+K` opens the quick capture modal; submitting text creates a note and shows a success toast.

**Complexity:** M (MCP tools are thin wrappers; `pick_next_task` query logic is the most nuanced; session sync needs careful dedup)

---

#### Phase 6 — Slack Bot + SSE Polish + Bull Board

**Goal:** Team capture via Slack is live. Real-time updates in the web app are robust. Job queue monitoring is available for debugging.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/api** | `src/integrations/slack/app.ts` (Slack Bolt app: `/capture` slash command + `pushpin_added` emoji reaction handler), `src/integrations/slack/handlers.ts` (extract message text + context, build `SourceMeta`, call `captureService.capture()`), `src/routes/admin.ts` (mount `@bull-board/hono` at `/admin/queues` behind auth) |
| **packages/web** | SSE reconnection logic (exponential backoff), optimistic updates on review resolution, real-time badge count on sidebar for pending review items |
| **render.yaml** | Add environment variables for Slack tokens |

**Dependencies:** Phase 2 (capture pipeline), Phase 4 (web frontend for SSE polish)

**Done checkpoint:**
1. In Slack: `/capture We need to redesign the onboarding flow` creates a raw note with `source: 'slack'`.
2. In Slack: add pushpin emoji to any message — the bot captures that message as a raw note.
3. Bull Board at `/admin/queues` shows job history, retry controls, and failed job details.
4. Web app review queue updates in real-time when new review items are created (SSE push, no manual refresh).

**Complexity:** M (Slack Bolt setup is well-documented; SSE reconnection and optimistic updates need care)

---

#### Phase 7 — PWA, Dashboard Polish, and Settings

**Goal:** The web app is installable, mobile-friendly, and fully featured. Settings page for API key management. This completes v1.0.

**What gets built:**

| Package | Files / Artifacts |
|---|---|
| **packages/web** | PWA config: `vite-plugin-pwa` in `vite.config.ts`, `public/manifest.json`, app icons. Dashboard polish: epic drag-to-reorder, inline entity status change, bulk actions. Settings page: `src/routes/settings.tsx` (API key management: create/list/revoke). Filters & URL state: all filter states persisted in URL search params via TanStack Router. Responsive: mobile layout for review queue, sidebar collapses to hamburger. |
| **packages/api** | Content search/filter, cursor pagination on all list endpoints |

**Dependencies:** Phase 4 (web frontend must be functional)

**Done checkpoint:**
1. On mobile Chrome/Safari, "Add to Home Screen" installs the PWA with the correct icon and name.
2. Settings page shows current API keys; creating a new key shows the plaintext once; revoking a key removes access.
3. All dashboard filters are reflected in the URL; sharing a filtered URL loads the same view.
4. Mobile review queue is usable (cards stack vertically, action buttons accessible).

**Complexity:** M (PWA config is simple; responsive polish is labor-intensive but not technically hard)

---

#### Phase 8 — DSPy Python Sidecar (Self-Improving Extraction)

**Goal:** The system learns from human corrections. A Python sidecar worker consumes training data from the review queue and optimizes extraction prompts using DSPy.

**What gets built:**

| New directory | Files / Artifacts |
|---|---|
| **packages/dspy-worker/** | `pyproject.toml` (dependencies: `dspy`, `litellm`, `psycopg2-binary`, `pydantic`), `src/signatures.py` (DSPy Signatures mirroring Zod extraction schemas), `src/optimizer.py` (load training JSONL, run `BootstrapFewShot` optimizer, output optimized prompt config JSON), `src/worker.py` (poll or consume from Redis queue, run extraction using optimized prompts), `src/export.py` (export JSONL from review_queue), `Dockerfile` |
| **packages/api** | `src/jobs/review-queue-export.ts` (`review-queue:export-training-data` job), admin endpoint `POST /api/admin/export-training-data` |
| **render.yaml** | Add Python worker service (Docker), add cron job for nightly training data export |

**Dependencies:** Phase 3 (review queue must have 20-50 resolved corrections to be useful). This phase should only start after the system has been in use long enough to accumulate training data.

**Done checkpoint:**
1. `POST /api/admin/export-training-data` produces a JSONL file with 20+ training examples.
2. Running the DSPy optimizer produces an optimized prompt config.
3. The Python worker produces entities with measurably higher confidence scores compared to the base TypeScript extraction.
4. The Python worker is deployed on Render and processes notes from the queue.

**Complexity:** L (Python environment, DSPy setup, LiteLLM integration, training data pipeline, deployment as a separate service)

---

### MVP Definition

**MVP = Phases 1 + 2 + 3 + 4**

After these four phases, the system delivers:
- Full Postgres schema with all 12 tables
- API key authentication
- Unified capture endpoint (any client can send notes)
- AI extraction pipeline (Claude API + Zod, two-phase: extract then organize)
- Background job processing (BullMQ + Redis)
- Review queue with full resolution semantics (accept/reject/modify, training comments)
- CLI for dogfooding (`pm capture`, `pm tasks`, `pm review`)
- Web dashboard with review queue, project list, project detail, entity detail
- Dark industrial design system
- Auto-deploying to Render

**What's NOT in MVP:** MCP tools, Slack bot, PWA installability, DSPy optimization, session sync, Bull Board monitoring.

### Version Milestones

| Version | Phases | What it means |
|---|---|---|
| **MVP** | 1-4 | Capture notes, extract entities, review AI decisions, view projects — usable end-to-end via CLI and web |
| **v1.0** | 1-7 | Full product: MCP tools for agent-native access, Slack capture, PWA installable, polished responsive UI, real-time updates, settings page |
| **v1.1** | 8 | Self-improving extraction via DSPy (requires accumulated review data from v1.0 usage) |
| **Future** | Beyond 8 | Work Evolution Tracker, Apple Shortcuts, Fireflies.ai, pgvector dedup, full-text search, Apache AGE |

### Dependency Graph

```
Phase 1 (Foundation)
  |
  v
Phase 2 (Capture Pipeline)
  |
  +---------+----------+
  |         |          |
  v         v          |
Phase 3   Phase 6     |
(Review    (Slack +    |
 + CLI)    Bull Board) |
  |                    |
  v                    |
Phase 4 (Web Frontend) |
  |         |          |
  |         v          |
  |       Phase 6      |
  |       (SSE polish) |
  v                    |
Phase 5 (MCP + Capture UX)
  |
  v
Phase 7 (PWA + Polish)
  |
  v
Phase 8 (DSPy) -- only after 20-50 review corrections accumulated
```

Phase 6 has two dependency paths — Slack depends on Phase 2 (capture pipeline), while SSE polish depends on Phase 4 (web frontend). Phase 8 has a soft dependency on real-world usage data, not just code.

### Complexity Summary

| Phase | Name | Complexity | Estimated Relative Effort |
|---|---|---|---|
| 1 | Foundation | L | Largest boilerplate; sets the pattern for everything |
| 2 | Capture Pipeline | L | Claude integration + BullMQ + transactional extraction |
| 3 | Review Queue + CLI | M | Review resolution logic is intricate; CLI is straightforward |
| 4 | Web Frontend | L | Most files; design system, multiple routes, real-time |
| 5 | MCP + Quick Capture | M | Thin wrappers + pick_next_task query logic |
| 6 | Slack + SSE + Bull Board | M | Slack Bolt is well-documented; SSE reconnection needs care |
| 7 | PWA + Polish | M | PWA config is simple; responsive polish is labor |
| 8 | DSPy Sidecar | L | Separate language, optimizer pipeline, new deployment unit |

---

## Render Infrastructure (render.yaml)

All infrastructure defined here. Zero manual creation in Render dashboard.

```yaml
# render.yaml — AI-Powered Project Management System
# See: https://render.com/docs/blueprint-spec

# ─── Environment Variable Groups ──────────────────────────────────────────────
envVarGroups:
  - name: pm-shared-secrets
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false                         # Prompted in dashboard on first deploy
      - key: API_KEY_HASH_PEPPER
        generateValue: true                 # Random 256-bit base64 pepper for API key hashing
      - key: NODE_ENV
        value: production
      - key: LOG_LEVEL
        value: info
      - key: BULLMQ_CONCURRENCY
        value: "5"
      - key: CORS_ORIGINS
        sync: false                         # Comma-separated allowed origins
      - key: CONFIDENCE_THRESHOLD
        value: "0.9"

# ─── Services ─────────────────────────────────────────────────────────────────
services:
  # ── Hono API Server ──────────────────────────────────────────────────────────
  - type: web
    name: pm-api
    runtime: node
    plan: starter
    region: oregon
    branch: main
    rootDir: packages/api
    buildCommand: npm install && npm run build
    startCommand: node dist/server.js
    healthCheckPath: /api/health
    numInstances: 1
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: pm-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: pm-redis
          type: keyvalue
          property: connectionString
      - key: PORT
        value: "10000"
      - fromGroup: pm-shared-secrets
    autoDeploy: true

  # ── BullMQ Background Worker ─────────────────────────────────────────────────
  - type: worker
    name: pm-worker
    runtime: node
    plan: starter
    region: oregon
    branch: main
    rootDir: packages/api
    buildCommand: npm install && npm run build
    startCommand: node dist/worker.js
    numInstances: 1
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: pm-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: pm-redis
          type: keyvalue
          property: connectionString
      - fromGroup: pm-shared-secrets
    autoDeploy: true

  # ── Vite React SPA (Static Site) ────────────────────────────────────────────
  - type: web
    name: pm-web
    runtime: static
    plan: starter
    region: oregon
    branch: main
    rootDir: packages/web
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    headers:
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: X-Frame-Options
        value: DENY
    envVars:
      - key: VITE_API_BASE_URL
        fromService:
          name: pm-api
          type: web
          property: hostport
      - key: VITE_APP_TITLE
        value: Project Management Agent
    autoDeploy: true

  # ── Redis (BullMQ Queue) ─────────────────────────────────────────────────────
  - type: keyvalue
    name: pm-redis
    plan: starter
    region: oregon
    maxmemoryPolicy: noeviction         # BullMQ requires noeviction to prevent job loss
    ipAllowList:
      - source: 0.0.0.0/0
        description: Allow all Render internal services

  # ── Cron Job: Training Data Export ───────────────────────────────────────────
  - type: cron
    name: pm-training-export
    runtime: node
    plan: starter
    region: oregon
    branch: main
    rootDir: packages/api
    schedule: "0 3 * * *"              # Nightly at 3:00 AM UTC
    buildCommand: npm install && npm run build
    startCommand: node dist/jobs/export-training-data.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: pm-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: pm-redis
          type: keyvalue
          property: connectionString
      - fromGroup: pm-shared-secrets

# ─── Databases ────────────────────────────────────────────────────────────────
databases:
  - name: pm-postgres
    plan: starter
    region: oregon
    postgresMajorVersion: "16"
    ipAllowList:
      - source: 0.0.0.0/0
        description: Allow all Render internal services
```

### render.yaml Notes

- **`noeviction` for Redis**: BullMQ requires `maxmemoryPolicy: noeviction`. If Redis evicts keys under memory pressure, jobs are silently lost.
- **`rootDir`**: Points each service to the correct monorepo package.
- **`healthCheckPath`**: Render uses this for zero-downtime deploys. The API server must respond 200 on `/api/health` before traffic is routed.
- **Static site rewrite rule**: `/* → /index.html` enables client-side routing via TanStack Router.
- **`VITE_API_BASE_URL`**: Uses `fromService` with `property: hostport` to inject the full URL at build time.
- **`sync: false`**: Used for `ANTHROPIC_API_KEY` and `CORS_ORIGINS` — prompted in dashboard on first deploy, never stored in YAML.
- **`generateValue: true`**: Used for `API_KEY_HASH_PEPPER` — Render generates a random 256-bit base64 value on first deploy.

---

## Environment Variables

### Shared Secrets (via `pm-shared-secrets` environment group)

| Name | Description | Required | Used By |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | API key for Claude extraction | Yes | worker, cron |
| `API_KEY_HASH_PEPPER` | Static pepper for API key SHA-256 hashing. Generated once by Render. | Yes | api, worker |
| `NODE_ENV` | Runtime environment flag | Yes | api, worker, cron |
| `LOG_LEVEL` | Pino log level | Yes | api, worker, cron |
| `BULLMQ_CONCURRENCY` | Max concurrent jobs per worker instance (default: 5) | No | worker |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins | Yes | api |
| `CONFIDENCE_THRESHOLD` | Minimum field confidence before routing to review queue (default: 0.9) | No | worker |

### Per-Service Variables

| Service | Variable | Description |
|---|---|---|
| `pm-api` | `DATABASE_URL` | PostgreSQL connection string (injected via `fromDatabase`) |
| `pm-api` | `REDIS_URL` | Redis connection string (injected via `fromService`) |
| `pm-api` | `PORT` | HTTP listen port (`10000` for Render) |
| `pm-worker` | `DATABASE_URL` | Same as API |
| `pm-worker` | `REDIS_URL` | Same as API |
| `pm-web` | `VITE_API_BASE_URL` | Full URL of the API server (build-time only) |
| `pm-web` | `VITE_APP_TITLE` | Application title for `<title>` tag and PWA manifest |

### Local Development Overrides (not in render.yaml)

| Name | Example Value |
|---|---|
| `DATABASE_URL` | `postgresql://localhost:5432/pm_dev` |
| `REDIS_URL` | `redis://localhost:6379` |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `API_KEY_HASH_PEPPER` | `dev-pepper-not-for-production` |
| `CORS_ORIGINS` | `http://localhost:5173` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `debug` |
| `VITE_API_BASE_URL` | `http://localhost:3000` |

---

## Cross-cutting Concerns

### Error Handling

#### Standard Error Response Envelope

All API errors return a consistent JSON envelope:

```typescript
interface ErrorResponse {
  error: {
    code: string;          // Machine-readable (e.g., "VALIDATION_ERROR")
    message: string;       // Human-readable description
    status: number;        // HTTP status code
    details?: unknown;     // Optional structured data (Zod issues, etc.)
    requestId?: string;    // Correlation ID from request context
  };
}
```

#### HTTP Status Code Mapping

| Status | Code | When | `details` |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request body, invalid query params | Raw parse error |
| 401 | `UNAUTHORIZED` | Missing/invalid `Authorization` header, revoked key | None |
| 403 | `FORBIDDEN` | Valid key but insufficient permission (future) | None |
| 404 | `NOT_FOUND` | Entity/project/epic not found by ID | `{ resource, id }` |
| 409 | `CONFLICT` | Idempotent capture with conflicting content, stale update | `{ existingId }` |
| 422 | `VALIDATION_ERROR` | Zod validation failure | Zod `issues[]` array |
| 429 | `RATE_LIMITED` | Too many requests | `{ retryAfter: number }` |
| 500 | `INTERNAL_ERROR` | Unhandled exception, DB connection failure | None (never leak internals) |
| 503 | `SERVICE_UNAVAILABLE` | DB or Redis unreachable during health check | `{ checks: { db, redis } }` |

#### Frontend Error Boundary Strategy

Three layers:
1. **Global error boundary** (React `ErrorBoundary` at router root): full-page "Something went wrong" with reload button.
2. **Route-level error boundary** (TanStack Router `errorComponent` per route): error within the route's layout, not full-page crash.
3. **TanStack Query error handling**: queries show inline error states with retry buttons; mutations show toast notifications via shadcn/ui `Sonner`. Don't retry 4xx errors.

### Logging

**Library:** Pino — fastest Node.js structured JSON logger, integrates with Render's log aggregation.

| Level | Usage |
|---|---|
| `fatal` | Process must exit (DB pool exhausted, Redis permanently unreachable) |
| `error` | Unhandled exceptions, failed jobs after all retries |
| `warn` | Slow queries (>1s), API key near rate limit, Claude API retry |
| `info` | Significant application events (default production level) |
| `debug` | SQL queries, Claude API request/response shape, BullMQ job payload |
| `trace` | Full HTTP request/response bodies (never in production) |

Every log line includes: `requestId` (UUID), `userId` (from auth middleware), standard HTTP fields (`method`, `url`, `statusCode`, `responseTime`).

BullMQ workers use the same Pino instance, including `jobId`, `jobName`, and entity/note IDs for correlation.

### CORS

Configured via Hono's built-in `cors()` middleware, driven by `CORS_ORIGINS` environment variable. `credentials: false` (API key auth, not cookies). Preflight cache: 24 hours.

For local development, Vite's dev server proxy avoids CORS entirely:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
  },
}
```

### Rate Limiting

Two tiers, using `hono-rate-limiter` with Redis store:

**Tier 1: API Key Brute-Force Protection** — before auth, keyed on client IP.
- Window: 15 minutes, max 20 failed auth attempts per IP.
- Only counts requests that return 401.

**Tier 2: Capture Endpoint Spam Protection** — after auth, keyed on API key.
- Window: 1 minute, max 30 requests per API key.
- Scope: `POST /api/notes/capture` only.

**Why Redis store**: In-memory rate limiting resets on deploy. Redis-backed stores survive redeploys and work across multiple API instances.

### Health Check

**Endpoint:** `GET /api/health` (no auth required)

```typescript
// 200 OK
{ "status": "ok", "timestamp": "...", "checks": { "db": { "status": "ok", "latencyMs": 3 }, "redis": { "status": "ok", "latencyMs": 1 } } }

// 503 Service Unavailable
{ "status": "degraded", "timestamp": "...", "checks": { "db": { "status": "ok", "latencyMs": 3 }, "redis": { "status": "fail", "error": "ECONNREFUSED" } } }
```

Returns 503 (not 500) when degraded — signals to load balancers that the instance should not receive traffic. Each check has a 5-second timeout.

---

## Testing Strategy

### Framework Choices

- **Vitest** for unit and integration tests — shares Vite's config/transform pipeline, runs ESM natively, workspace mode runs all four packages from repo root.
- **Hono `app.request()`** for API integration tests — real HTTP request without starting a server, faster and more deterministic than supertest.
- **Playwright** for E2E (critical paths only) — headless Chromium, better PWA testing, parallel workers out of the box.

### Per-Package Test Strategy

**`packages/shared`** — Unit tests only. Pure functions. Zod schema validation (positive + negative cases), type guards, constants. **Coverage target: 90%+.**

**`packages/api`** — Unit tests for services (mocked DB), integration tests for routes (real Postgres via testcontainers):
- Unit: status transition validation, review resolution semantics, confidence threshold checks, auth middleware logic
- Integration via `app.request()`: CRUD operations, auth middleware (valid/missing/revoked key), idempotent capture, review resolution atomic writes, cursor pagination, FK constraint errors
- BullMQ jobs: test processor functions in isolation with mock `Job` objects
- **Coverage target: 70% overall, services/middleware ~85%.**

**`packages/web`** — Component tests for critical interactive components only (review queue item, entity list + filters, capture form, dashboard stats). Not every component. Vitest + `@testing-library/react`. No visual regression. **No numeric coverage mandate.**

**`packages/cli`** — Unit tests for command parsing, integration tests against mock API. Config loading, error handling, output formatting. **Coverage target: 70%.**

### Database Testing

**CI:** `@testcontainers/postgresql` spins up a real PostgreSQL container. Run Drizzle migrations before the test suite. Each test wrapped in a transaction that rolls back.

**Local:** Same testcontainers approach (requires Docker) or dedicated `pm_test` database.

**Seed data:** Factory functions (`createTestUser()`, `createTestProject()`, `createTestEntity()`) that accept partial overrides. No static SQL seed files.

### AI Extraction Testing

**Layer 1: Fixture-Based Schema Validation (every PR)** — Recorded Claude API responses as JSON fixtures. Test Zod schema validates them correctly. Edge cases: empty content, multi-entity, unicode, relative dates.

**Layer 2: Prompt Assembly Tests (every PR)** — Test prompt construction separately from API call. Pure unit tests.

**Layer 3: Real Claude API Integration (nightly)** — Run extraction against 10-15 representative raw notes. Compare against expected output. Gate behind `TEST_AI_INTEGRATION=true` flag. Cost: ~$0.10-0.50 per run.

**Layer 4: VCR/Snapshot Pattern** — First run makes real API call, saves cassette. Subsequent runs replay from cassette. Re-record explicitly when prompts change.

### CI Pipeline

**On Every PR:**
- Lint + typecheck across all packages
- `packages/shared` tests
- `packages/api` tests (unit + integration with testcontainers, AI fixture-based only)
- `packages/web` component tests
- `packages/cli` tests
- Build verification

**Estimated PR CI time:** 3-5 minutes.

**Nightly:**
- AI integration tests (real Claude API calls)
- E2E tests (Playwright: capture → extraction → review → dashboard, 3-5 critical path tests)

### Coverage Thresholds

| Package | Threshold | Rationale |
|---|---|---|
| `packages/shared` | 90% | Pure functions, cheap to test thoroughly |
| `packages/api` | 70% | Services and middleware well-tested; route handlers get implicit coverage |
| `packages/web` | No mandate | Test what breaks, not what renders |
| `packages/cli` | 70% | Small surface area |

---

## Auth Middleware Specification

### Middleware Chain Position

```
Request → CORS → Public route check → Auth middleware → Zod validation → Route handler
```

### Public Routes (skip auth)

| Route | Purpose |
|---|---|
| `GET /api/health` | Health check for load balancer / uptime monitors |
| `GET /api/mcp` | MCP manifest endpoint (tool discovery is public; tool execution requires auth) |

### Auth Flow

1. **Check for `Authorization` header** — missing → 401 `"Missing Authorization header"`
2. **Validate `Bearer <token>` format** — invalid format → 401 `"Invalid Authorization header format"`
3. **Hash and lookup** — `sha256(plaintextKey)`, query `api_keys WHERE key_hash = ? AND revoked_at IS NULL` — not found → 401 `"Invalid API key"` (same message for not-found and revoked, to prevent enumeration)
4. **Resolve user** — query `users WHERE id = apiKey.userId` — orphaned key → 401
5. **Attach to context** — `c.set('user', user)`, `c.set('apiKey', apiKeyRecord)`
6. **Update `last_used_at` (non-blocking)** — fire-and-forget, do not block the request
7. **Continue** — `await next()`

### SHA-256 Hashing

Uses Web Crypto API (`crypto.subtle`) — available in Node.js 18+ and all modern runtimes. No external dependency.

### Hono Typing

```typescript
// packages/api/src/types/env.ts
export type AppEnv = {
  Variables: {
    user: User;      // Always present after auth middleware
    apiKey: ApiKey;   // Always present after auth middleware
  };
};
```

All route handlers get typed access to `c.get('user')` — TypeScript knows it's `User`, not `undefined`.

### User Bootstrapping

**CLI seed command** (`pnpm db:seed`):
1. Checks if any users exist in the database
2. If zero users: creates a default user and a named API key
3. Prints the plaintext API key to stdout exactly once
4. If users already exist: prints a message and exits (idempotent)

### API Key Format

Prefixed format for easy identification and leak detection:

```
pm_live_<32 random hex characters>
pm_test_<32 random hex characters>
```

The prefix makes it easy to grep for leaked keys in logs, git history, or secret scanners (GitHub's secret scanning can detect `pm_live_` prefixed strings).

---

## MCP Tool Schemas

All tools exposed via `@modelcontextprotocol/hono` middleware. Each tool wraps one or more API endpoints. The MCP server authenticates using the same `Authorization: Bearer <key>` mechanism — the key is passed as an environment variable in the MCP client config.

### Tool 1: `capture_note`

**Description:** Capture a raw note for AI processing. Queued for entity extraction and project routing.

**Wraps:** `POST /api/notes/capture`

**Input:** `{ content: string, source?: NoteSource (default 'mcp'), sourceMeta?: object, externalId?: string, capturedAt?: ISO8601 }`

**Output:** `{ note: RawNote, deduped: boolean }`

### Tool 2: `list_projects`

**Description:** List all active projects. Use to understand what projects exist before routing tasks.

**Wraps:** `GET /api/projects`

**Input:** `{ status?: 'active' | 'archived' | 'paused', includeArchived?: boolean }`

**Output:** `{ items: Project[] }`

### Tool 3: `get_project_dashboard`

**Description:** Aggregated project overview: task counts by status, open decisions, recent insights, epic summaries, recent entities.

**Wraps:** `GET /api/projects/:id/dashboard`

**Input:** `{ projectId: uuid, since?: ISO8601 }`

**Output:** `{ project, stats: { tasksByStatus, openDecisions, recentInsights, totalEntities }, epics: EpicSummary[], recentEntities: Entity[] }`

### Tool 4: `list_tasks`

**Description:** Query tasks with filters. Supports cursor pagination.

**Wraps:** `GET /api/entities?type=task`

**Input:** `{ projectId?, epicId?, status?, assigneeId?, sort?: 'priority' | 'created_at' | 'updated_at', order?, limit?, cursor? }`

**Output:** `{ items: Task[], nextCursor: string | null }`

### Tool 5: `pick_next_task`

**Description:** Get the single highest-priority unstarted task for a project. Returns top task by priority, falling back to most recently created.

**Wraps:** Custom query on entities table.

**Input:** `{ projectId: uuid, epicId?: uuid, assigneeId?: uuid }`

**Output:** `{ task: Task | null, reasoning: string }`

### Tool 6: `update_task_status`

**Description:** Update entity status. Creates an audit trail event atomically.

**Wraps:** `POST /api/entities/:id/status`

**Input:** `{ entityId: uuid, newStatus: string }`

**Output:** `{ entity: Entity, previousStatus: string, event: EntityEvent }`

### Tool 7: `get_entity`

**Description:** Full entity details including attributes, relationships, evidence, and AI metadata.

**Wraps:** `GET /api/entities/:id`

**Input:** `{ entityId: uuid }`

**Output:** `{ entity: Entity (with evidence[], aiMeta) }`

### Tool 8: `add_entity_comment`

**Description:** Add a comment/progress note to an entity. Stored in entity_events audit trail.

**Wraps:** `POST /api/entities/:id/events`

**Input:** `{ entityId: uuid, body: string, meta?: object }`

**Output:** `{ event: EntityEvent }`

### Tool 9: `list_review_queue`

**Description:** List items pending human review — type classifications, project assignments, duplicate detections, epic suggestions.

**Wraps:** `GET /api/review-queue`

**Input:** `{ status?: ReviewStatus (default 'pending'), projectId?, entityId?, reviewType?, limit?, cursor? }`

**Output:** `{ items: ReviewQueueItem[], nextCursor: string | null }`

### MCP Tool Summary

| # | Tool Name | API Endpoint | Method |
|---|---|---|---|
| 1 | `capture_note` | `/api/notes/capture` | POST |
| 2 | `list_projects` | `/api/projects` | GET |
| 3 | `get_project_dashboard` | `/api/projects/:id/dashboard` | GET |
| 4 | `list_tasks` | `/api/entities?type=task` | GET |
| 5 | `pick_next_task` | Custom query | GET |
| 6 | `update_task_status` | `/api/entities/:id/status` | POST |
| 7 | `get_entity` | `/api/entities/:id` | GET |
| 8 | `add_entity_comment` | `/api/entities/:id/events` | POST |
| 9 | `list_review_queue` | `/api/review-queue` | GET |
