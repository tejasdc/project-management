# Implementation Review

## Summary
- Stories checked: 35/35 (US-001 through US-035)
- Passing: 14
- Gaps: 21

## Per-Story Findings
### US-001: Create shared TypeScript types and Zod schemas
- Status: PASS
- Gaps: None

### US-002: Create Drizzle ORM enum definitions
- Status: PASS
- Gaps: None

### US-003: Create users and projects Drizzle table schemas
- Status: PASS
- Gaps: None

### US-004: Create epics and entities Drizzle table schemas
- Status: PASS
- Gaps: None

### US-005: Create raw_notes, entity_sources, and entity_relationships table schemas
- Status: PASS
- Gaps: None

### US-006: Create tags, entity_tags, review_queue, entity_events, and api_keys table schemas
- Status: PASS
- Gaps: None

### US-007: Create Drizzle relations and schema barrel export
- Status: PASS
- Gaps: None

### US-008: Set up Drizzle config, database connection, migration, triggers, and lineage function
- Status: PARTIAL
- Gaps:
- `packages/api/src/db/index.ts` uses `postgres` (postgres-js) instead of node-postgres (`pg`) as required.
- `packages/api/package.json` missing `db:studio` script.
- “Running `pnpm --filter api db:generate` creates migrations including triggers/functions” not verified; repo contains `packages/api/drizzle/0000_skinny_mathemanic.sql` with the required trigger/function SQL, but generation behavior is not asserted by code.

### US-009: Create Drizzle-Zod validation schemas
- Status: PASS
- Gaps: None

### US-010: Create Hono app entrypoint with health check
- Status: PARTIAL
- Gaps:
- No `packages/api/src/server.ts`; server starts from `packages/api/src/index.ts` instead.
- App type for Hono RPC (`typeof app`) is not exported; web client uses `as any` and is untyped (`packages/web/src/lib/api-client.ts`).
- “Middleware chain order” is not represented as CORS -> Public route check -> Auth -> Zod -> handler; public-route skipping is implemented inside `packages/api/src/middleware/auth.ts` rather than as an explicit pre-auth routing gate.
- `GET /api/health` degraded response includes full `checks` payload; AC calls for `503` with `{ status: 'degraded' }` (strictly, shape differs).

### US-011: Implement API key auth service and middleware
- Status: PARTIAL
- Gaps:
- `packages/api/src/services/auth.ts` does not export `generateApiKey()` returning `{ plaintextKey, keyHash }`; instead exports `generateApiKeyPlaintext()` and separate hashing.
- Key format is `pm_${env}_...` (e.g., `pm_test_...` in non-production), not always `pm_live_...` as specified.
- `hashApiKey()` requires a `pepper` and hashes `${pepper}:${plaintextKey}`; spec calls for hashing the plaintext directly (no pepper parameter).
- `validateApiKey()` helper function is not implemented/exported; middleware embeds the lookup logic directly (`packages/api/src/middleware/auth.ts`).
- Public-route skip list includes `/api/mcp`, but no `/api/mcp` route exists in `packages/api/src/routes/`.

### US-012: Implement auth routes (me, api-keys, users)
- Status: PASS
- Gaps: None

### US-013: Create database seed script
- Status: PASS
- Gaps: None

### US-014: Implement standard error handling and Pino logging
- Status: PARTIAL
- Gaps:
- Error utilities don’t match spec: `packages/api/src/lib/errors.ts` exports `ApiError` (not `AppError`) and lacks explicit factory helpers for `RATE_LIMITED`, `INTERNAL_ERROR`, `VALIDATION_ERROR`, etc.
- Pino logger is minimally configured (`packages/api/src/lib/logger.ts`) and does not automatically include `requestId`/`userId` on every line (those fields are only present for logs emitted by `packages/api/src/app.ts` request middleware).
- Specified log-level semantics (slow queries, Claude retries, trace-body rules, etc.) are not implemented.
- BullMQ workers do not use a structured logger with job correlation fields beyond ad-hoc fields in event handlers (`packages/api/src/worker.ts`).
- 422 validation includes Zod issues (implemented) but does not wrap into a dedicated `VALIDATION_ERROR` factory.

### US-015: Implement project and epic CRUD routes
- Status: PARTIAL
- Gaps:
- Cursor pagination requirement is not met for projects listing; `GET /api/projects` returns full list without `limit/cursor/nextCursor` (`packages/api/src/routes/projects.ts`, `packages/api/src/services/projects.ts`).
- Cursor pagination requirement is not met for epics listing; `GET /api/epics` returns full list without `limit/cursor/nextCursor` (`packages/api/src/routes/epics.ts`).
- Global list-endpoint mandate “max limit 100” is not enforced; `parseLimit()` defaults `maxLimit` to `200` (`packages/api/src/lib/pagination.ts`), and many list endpoints use it.

### US-016: Implement entity CRUD routes
- Status: PASS
- Gaps: None

### US-017: Implement note capture endpoint with idempotent ingestion
- Status: PARTIAL
- Gaps:
- Dedup behavior: `packages/api/src/services/capture.ts` enqueues `notes:extract` for deduped notes when `note.processed === false`; AC specifies “enqueue on successful creation (not on dedup)”.

### US-018: Set up BullMQ queue infrastructure with Redis
- Status: PARTIAL
- Gaps:
- Missing required queues in `packages/api/src/jobs/queue.ts`: `entities:compute-embeddings`, `review-queue:export-training-data` are not defined/exported.
- Worker concurrency is hardcoded (5/5/2) and not configurable via `BULLMQ_CONCURRENCY` (`packages/api/src/worker.ts`).
- Redis reconnection strategy is not explicitly configured (relies on ioredis defaults).

### US-019: Implement Phase A entity extraction (Claude API + Zod)
- Status: PARTIAL
- Gaps:
- No retry-on-Zod-failure flow (spec: retry once with validation issues appended); current implementation throws immediately (`packages/api/src/ai/extraction.ts`).
- System prompt does not include the 3 required few-shot examples from `docs/extraction-prompts.md` (CLI, Slack, meeting transcript).
- Output schema deviates from spec for evidence: `packages/api/src/ai/schemas/extraction-schema.ts` evidence items do not include `confidence`.
- aiMeta requirements not met: extraction does not provide `extractedAt` and `tokenUsage` to be stored; job uses `{ model, promptVersion, extractionRunId, fieldConfidence }` only (`packages/api/src/jobs/notes-extract.ts`).

### US-020: Implement Phase B entity organization (Claude API + Zod)
- Status: PARTIAL
- Gaps:
- System prompt does not include the required Phase B few-shot example from `docs/extraction-prompts.md` (`packages/api/src/ai/organization.ts`).

### US-021: Implement notes:extract BullMQ job processor
- Status: PARTIAL
- Gaps:
- Evidence permalink “computed from source metadata” is not implemented beyond reusing `sourceMeta.permalink` when present; no Slack/Obsidian/other permalink derivation logic (`packages/api/src/jobs/notes-extract.ts`).
- Evidence items in DB do not include evidence-level confidence (schema + insertion omit it).
- Review-queue creation is incomplete vs. spec: only a subset of low-confidence fields generate reviews (type, owner, overall confidence). Content/status/other attribute field-confidence reviews are not generated.
- Retry/backoff is exponential but no jitter is implemented; deterministic Zod mismatch discard is based on presence of `issues[]` (and happens immediately), which is not the same as “after N tries”.

### US-022: Implement entities:organize BullMQ job processor
- Status: PARTIAL
- Gaps:
- Duplicate detection review creation is “top candidate only” rather than preserving candidate list as suggested by the spec.
- Epic suggestion review items use a hardcoded `aiConfidence` of `0.85` rather than being derived from model output (`packages/api/src/jobs/entities-organize.ts`).

### US-023: Implement review queue list endpoint and resolve framework
- Status: PARTIAL
- Gaps:
- Default batching/sorting order is not implemented on the API endpoint; list ordering is `created_at desc` only (`packages/api/src/routes/review-queue.ts`).

### US-024: Implement per-reviewType resolution logic
- Status: PARTIAL
- Gaps:
- `type_classification` does not reconcile and auto-reject other now-nonsensical pending review types for the entity; it only auto-rejects other pending `type_classification` items (`packages/api/src/services/review.ts`).
- `project_assignment` / `epic_assignment` / `assignee_suggestion`: “rejected” does not apply a clearing action (effects are skipped entirely on `rejected`), which conflicts with “sets/clears based on accepted/rejected/modified”.
- `epic_creation`: does not create follow-up `epic_assignment` review items for candidate entities (not implemented).
- Edge case “type change during review reconciles other pending reviews” is not implemented beyond the narrow type_classification de-dupe.

### US-025: Implement tag routes
- Status: PASS
- Gaps: None

### US-026: Implement rate limiting middleware
- Status: PASS
- Gaps: None

### US-027: Set up Vitest test infrastructure with testcontainers
- Status: MISSING
- Gaps:
- No Vitest configuration at repo root or package level.
- No `packages/api/tests/` infrastructure (`setup.ts`, factories, helpers).
- No coverage thresholds configuration.
- No `pnpm test` scripts for workspace testing.

### US-028: Build CLI tool: config, capture, and project listing
- Status: PASS
- Gaps: None

### US-029: Build CLI tool: status updates and review
- Status: PARTIAL
- Gaps:
- Terminal readability requirement (tables) not met; most output is raw JSON or simple lines (`packages/cli/src/index.ts`).

### US-030: Build CLI tool: session-sync command
- Status: MISSING
- Gaps:
- No `pm session-sync` command; no filesystem scanning/upload/dedup/summary implementation (`packages/cli/src/index.ts`).

### US-031: Set up web frontend foundation (Vite + React + TanStack Router + dark theme + error boundaries)
- Status: PARTIAL
- Gaps:
- TanStack Router is not set up with file-based routing; routes are manually declared in `packages/web/src/router.tsx`.
- Hono RPC client is not strongly typed (depends on missing exported `typeof app` from API); `api` is cast to `any` (`packages/web/src/lib/api-client.ts`).
- `src/components/ui/` (shadcn/ui) is not present; UI uses bespoke components only.
- Query error UX is inconsistent with spec: pages show error text but generally no inline “retry” buttons; mutations toast via `sonner` exists, and 4xx query retries are disabled (implemented).
- “Verify in browser using dev-browser skill” not performed here (not implemented/recorded in code).

### US-032: Build review queue page
- Status: PARTIAL
- Gaps:
- No “Modify” action in the web UI; only Accept/Reject are implemented (`packages/web/src/components/ReviewCard.tsx`).
- Visual match to `mockups/review-queue.html` not verifiable from code alone (no automated screenshot test).
- “Verify in browser using dev-browser skill” not performed here.

### US-033: Build project list and project dashboard pages
- Status: PARTIAL
- Gaps:
- Project list does not show required counts (task counts by status, open decisions, recent insights); `ProjectCard` supports `stats` but caller doesn’t fetch/provide them (`packages/web/src/routes/projects.tsx`, `packages/web/src/components/ProjectCard.tsx`).
- Project dashboard page lacks required entity list with filters (type/status/assignee/epic) and “ungrouped entities” section; no URL-persisted filters (`packages/web/src/routes/projects.$projectId.tsx`).
- Visual match to `mockups/projects-dashboard.html` / `mockups/project-view.html` not verifiable from code alone.
- “Verify in browser using dev-browser skill” not performed here.

### US-034: Build entity detail page
- Status: PARTIAL
- Gaps:
- Does not display project/epic assignments or assignee (`packages/web/src/routes/entities.$entityId.tsx`).
- Attributes are rendered as raw JSON, not type-specific fields.
- Evidence “permalink links” are not clickable links; only a “link” label is shown when `permalink` exists.
- No inline status change dropdown.
- No add-comment form; timeline is read-only.
- Visual match to `mockups/entity-detail.html` not verifiable from code alone.
- “Verify in browser using dev-browser skill” not performed here.

### US-035: Implement SSE endpoint for real-time updates
- Status: PARTIAL
- Gaps:
- API does not emit the full required event set. Current emissions are limited to:
- Emits `review_queue:resolved` and `review_queue:resolved_batch` only (and only from review routes).
- Missing emits: `review_queue:created`, `entity:created`, `entity:updated`, `entity:event_added`, `raw_note:processed`, `project:stats_updated`.
- Web app does not connect to SSE at all (no `EventSource` usage), so:
- No TanStack Query invalidation on events.
- No reconnection with exponential backoff.
- Sidebar pending review badge is not real-time and is also incorrect as a “count” (query uses `limit=1`, so it can only ever show `0` or `1`) (`packages/web/src/components/layout/Sidebar.tsx`).

## Critical Issues (must fix)
- US-024 resolution semantics mismatch: “rejected clears assignment” and “type change reconciles other pending reviews” are not implemented; this will produce incorrect entity state and stale/invalid review items.
- US-035 real-time updates are incomplete: server does not emit required events, and web does not subscribe/invalidate; the review badge count is also functionally wrong (`limit=1`).
- US-027 is entirely missing (tests + testcontainers). This is a major gap for correctness and regressions across the extraction/review pipeline.
- US-015 pagination contract is not implemented for projects/epics, and global max-limit behavior does not match the spec.
- US-008 DB client implementation mismatch vs spec (`postgres-js` vs `pg`), plus missing `db:studio` script.

## Minor Issues
- API build tooling ergonomics: repo’s default `node` on PATH is `v12.17.0`, which breaks `pnpm`/`corepack` unless PATH is adjusted to the Node 22 toolchain.
- Type duplication: JSONB types exist in both `packages/shared/src/types.ts` and `packages/api/src/db/schema/types.ts`, increasing drift risk (especially for `EntityAiMeta`/evidence fields expected by the PRD).
- `packages/web/src/components/layout/Sidebar.tsx` “pending count” is a heuristic and not a count; should be replaced with a real count endpoint or a `limit=0` + count response contract.
