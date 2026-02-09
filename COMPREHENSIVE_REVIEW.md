# Comprehensive Review (US-001..US-035, US-037..US-038)

## 1. Summary

0/37 PASS

Primary blocker: **TypeScript typecheck could not run in this environment** because Node is **v12.17.0**, while the installed TypeScript runtime JS uses modern syntax (`??`). This makes every story’s “Typecheck passes” acceptance criterion fail.

## 2. Per-Story Table

| ID | Title | Status | Notes |
|---|---|---|---|
| US-001 | Create shared TypeScript types and Zod schemas | FAIL | `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/index.ts` match the requested exports. Fails: “pnpm --filter shared build succeeds” and “Typecheck passes” cannot be satisfied here because `npx tsc --noEmit` fails under Node v12 (see section 3). |
| US-002 | Create Drizzle ORM enum definitions | FAIL | `packages/api/src/db/schema/enums.ts` matches required enums/values. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-003 | Create users and projects Drizzle table schemas | FAIL | `packages/api/src/db/schema/users.ts`, `packages/api/src/db/schema/projects.ts` match columns/index. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-004 | Create epics and entities Drizzle table schemas | FAIL | `packages/api/src/db/schema/epics.ts` + `packages/api/src/db/schema/entities.ts` include requested columns, indexes, and CHECK constraints. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-005 | Create raw_notes, entity_sources, and entity_relationships schemas | FAIL | `packages/api/src/db/schema/raw-notes.ts`, `packages/api/src/db/schema/entity-sources.ts`, `packages/api/src/db/schema/entity-relationships.ts` match requested columns/indexes/uniques. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-006 | Create tags, entity_tags, review_queue, entity_events, api_keys schemas | FAIL | **Mismatch vs spec/docs:** `packages/api/src/db/schema/review-queue.ts` unique partial index adds `review_type <> 'low_confidence'` (spec/docs describe uniqueness for all pending rows with `entity_id IS NOT NULL`). Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-007 | Create Drizzle relations and schema barrel export | FAIL | `packages/api/src/db/schema/relations.ts` defines all requested relations; `packages/api/src/db/schema/index.ts` barrels schema exports. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-008 | Drizzle config, db client, migration, triggers, lineage function | FAIL | `packages/api/drizzle.config.ts`, `packages/api/src/db/index.ts`, `packages/api/package.json` scripts, and `packages/api/drizzle/0000_skinny_mathemanic.sql` include `set_updated_at()` + triggers (users/projects/epics/entities/review_queue) and `get_entity_lineage(...)` with direction/max_depth/cycle detection. Cannot validate “pnpm --filter api db:generate …” behavior here (tsc/build blocked). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-009 | Create Drizzle-Zod validation schemas | FAIL | `packages/api/src/db/validation.ts` exports the required insert/select schemas and includes custom JSONB schemas. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-010 | Hono app entrypoint with health check | FAIL | **Mismatch:** acceptance criteria say `packages/api/src/index.ts` creates the Hono app + CORS; actual app wiring is in `packages/api/src/app.ts` and `packages/api/src/index.ts` only re-exports. **Mismatch:** middleware chain order differs (rate limiter + request logging are inserted; there is no global “Zod validation” middleware). Health endpoint shape + 5s timeouts + unauthenticated `/api/health` are implemented in `packages/api/src/app.ts`. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-011 | API key auth service and middleware | FAIL | `packages/api/src/services/auth.ts` meets key format + WebCrypto SHA-256 hashing + revoked check. `packages/api/src/middleware/auth.ts` sets `user`/`apiKey` and updates `last_used_at`. **Mismatch:** public routes set only includes `/api/health`; `/api/mcp` route does not exist and is not excluded. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-012 | Auth routes (me, api-keys, users) | FAIL | `packages/api/src/routes/auth.ts` and `packages/api/src/routes/users.ts` implement the endpoints and rely on `toErrorResponse` envelope via `packages/api/src/app.ts`. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-013 | Database seed script | FAIL | `packages/api/scripts/seed.ts` is idempotent, creates default user + API key, prints plaintext once, and `packages/api/package.json` includes `db:seed`. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-014 | Standard error handling and Pino logging | FAIL | Error envelope exists: `packages/api/src/lib/errors.ts` + `packages/api/src/app.ts`. **Mismatch:** logger does not guarantee `requestId`/`userId` “in every log line” (it’s added in request middleware for request logs only). **Mismatch:** detailed log-level semantics are not implemented beyond `LOG_LEVEL`. Workers use `createJobLogger(job)` (`packages/api/src/lib/logger.ts`), but correlation fields beyond jobId/jobName are ad hoc. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-015 | Project and epic CRUD routes | FAIL | Cursor pagination is implemented for `/api/projects` and `/api/epics`. **Mismatch:** `/api/projects` does **not** default to active-only; it returns all statuses unless `?status=active` is passed (`packages/api/src/services/projects.ts`). Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-016 | Entity CRUD routes | FAIL | `packages/api/src/routes/entities.ts` + `packages/api/src/services/entities.ts` implement list filters, get-by-id, patch/create, events list/add comment, and atomic status transitions with `entity_events`. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-017 | Note capture endpoint with idempotent ingestion | FAIL | `/api/notes/capture` validates with `captureNoteSchema` and returns 201/200 with `deduped`. Enqueues `notes:extract` only when not deduped (`packages/api/src/services/capture.ts`). Listing + reprocess flow exists (`packages/api/src/routes/notes.ts`, `packages/api/src/jobs/notes-reprocess.ts`). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-018 | BullMQ queue infrastructure with Redis | FAIL | `packages/api/src/jobs/queue.ts` exports the required queues; `packages/api/src/worker.ts` processes the main queues and supports `BULLMQ_CONCURRENCY`. **Potential mismatch:** “reconnection strategy” is not explicitly configured (relies on ioredis defaults). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-019 | Phase A entity extraction (Claude API + Zod) | FAIL | `packages/api/src/ai/extraction.ts` uses tool forcing + `zodToJsonSchema` + single retry. **Mismatch:** `packages/api/src/ai/schemas/extraction-schema.ts` does not match the stricter schema described in `docs/extraction-prompts.md` (notably `sentiment` enum, `fieldConfidence` structure, and evidence fields). **Mismatch:** acceptance expects evidence items to include `confidence` and `rawNoteId` (AI output doesn’t; job injects `rawNoteId` but not `confidence`). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-020 | Phase B entity organization (Claude API + Zod) | FAIL | `packages/api/src/ai/organization.ts` uses tool forcing + schema validation + few-shot example. `packages/api/src/ai/schemas/organization-schema.ts` aligns with `docs/extraction-prompts.md` Phase B schema. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-021 | notes:extract BullMQ job processor | FAIL | `packages/api/src/jobs/notes-extract.ts` loads note, calls extraction, and in a transaction inserts entities + sources + relationships and marks note processed; creates review items for low-confidence fields; enqueues `entities:organize`. **Mismatch:** permalink handling is only `sourceMeta.permalink` (no computation for non-Slack sources like Obsidian paths). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-022 | entities:organize BullMQ job processor | FAIL | `packages/api/src/jobs/entities-organize.ts` fetches projects/epics/recent entities/users, calls org, applies high-confidence assignments, and creates review items for low-confidence + duplicates + epic suggestions. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-023 | Review queue list endpoint + resolve framework | FAIL | List endpoint exists with required filters and a project/entity/reviewType default ordering (`packages/api/src/routes/review-queue.ts`). Resolve is transactional and writes `entity_events` for entity-scoped reviews (`packages/api/src/services/review.ts`). **Edge mismatch:** project-scoped review items (e.g., `epic_creation` with `entityId` null) cannot produce an `entity_events` audit entry as written. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-024 | Per-reviewType resolution logic | FAIL | `packages/api/src/services/review.ts` implements type/project/epic/assignee/duplicate/epic_creation logic and auto-rejects pending reviews after type changes. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-025 | Tag routes | FAIL | `/api/tags` list/create and `/api/entities/:id/tags` replace implemented in `packages/api/src/routes/tags.ts`. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-026 | Rate limiting middleware | FAIL | Tier 1 + Tier 2 are implemented in `packages/api/src/middleware/rate-limit.ts` and applied in `packages/api/src/app.ts` / `packages/api/src/routes/notes.ts`. 429 response includes `error.code = RATE_LIMITED` and `retryAfter`. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-027 | Vitest test infrastructure with testcontainers | FAIL | Workspace Vitest exists (`vitest.config.ts`, `vitest.workspace.ts`, per-package configs). API uses testcontainers + migrations (`packages/api/tests/global-setup.ts`) and wipes data via `TRUNCATE` in `packages/api/tests/setup.ts`. **Mismatch:** spec asked for per-test transaction rollback, not truncate. **Mismatch:** shared/web/cli test suites are not present (configs exist, but no tests in repo for those packages). **Mismatch:** `pnpm test --filter api` is not the correct pnpm filter form (should be `pnpm --filter api test`). Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-028 | CLI: config, capture, project listing | FAIL | CLI is `commander`-based and stores config at `~/.pm/config.json` (`packages/cli/src/index.ts`). Capture uses `source: 'cli'` and hits `/api/notes/capture`. Projects command requests `?status=active` but prints **short IDs** (8 chars) rather than full IDs. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-029 | CLI: status updates and review | FAIL | `pm status` and interactive `pm review` implemented with tables/colors and accept/reject/modify flows (`packages/cli/src/index.ts`). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-030 | CLI: session-sync command | FAIL | `pm session-sync` uploads files under `~/.claude/projects` as raw notes with stable `externalId` to dedupe, and prints a summary (`packages/cli/src/index.ts`). Fails: “Typecheck passes” (Node/tsc blocker). |
| US-031 | Web foundation | FAIL | Vite proxy + React + TanStack Router plugin configured (`packages/web/vite.config.ts`). Router root has full-page error boundary; routes generally set `errorComponent: RouteError`. API client uses Hono `hc` and localStorage API key. Theme tokens + fonts match mockups (`packages/web/src/styles.css`, `packages/web/index.html`). **Not verified:** “Verify in browser using dev-browser skill” not performed here. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-032 | Review queue page | FAIL | `packages/web/src/routes/review.tsx`, `packages/web/src/components/ReviewCard.tsx`, `packages/web/src/components/ConfidenceBadge.tsx` implement the page and resolution actions, with training comment support. **Not verified:** visual match to `mockups/review-queue.html` and browser verification. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-033 | Project list + project dashboard pages | FAIL | Projects page exists and shows cards + dashboard stats, but it requests `/api/projects` without enforcing `status=active` (`packages/web/src/routes/projects.tsx`). Project dashboard supports URL-persisted filters and shows epics/progress + grouped/ungrouped entities (`packages/web/src/routes/projects.$projectId.tsx`). **Not verified:** mockup visual match + browser verification. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-034 | Entity detail page | FAIL | Entity detail page exists with status dropdown and comment posting (`packages/web/src/routes/entities.$entityId.tsx`). **Mismatch:** decision attributes omit `decidedBy`. **Mismatch:** timeline is not chronological; API returns events newest-first (`packages/api/src/services/entities.ts`) and UI renders in that order. **Not verified:** mockup visual match + browser verification. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-035 | SSE endpoint for real-time updates | FAIL | Authenticated SSE endpoint exists (`packages/api/src/routes/sse.ts`) backed by a Redis pub/sub event bus (`packages/api/src/services/events.ts`). Web client reconnects with exponential backoff and invalidates queries (`packages/web/src/components/SseProvider.tsx`), enabling live sidebar badge updates. Fails: “Typecheck passes” (Node/tsc blocker). |
| US-037 | Quick capture modal in web app | FAIL | Cmd/Ctrl+K modal exists and submits `/api/notes/capture` with `source: 'api'` (`packages/web/src/components/QuickCapture.tsx`). Header button triggers it (`packages/web/src/components/layout/Header.tsx`). **Mismatch:** no floating action button found. **Not verified:** mockup visual match + browser verification. Also fails: “Typecheck passes” (Node/tsc blocker). |
| US-038 | Settings page with API key management | FAIL | API keys list/create/revoke UI implemented (`packages/web/src/routes/settings.tsx`) including “plaintext shown once” and copy. **Not verified:** mockup visual match + browser verification. Also fails: “Typecheck passes” (Node/tsc blocker). |

## 3. TypeScript Compilation Results

All four requested commands failed the same way:

1. `packages/api`: `npx tsc --noEmit` → **FAIL**
2. `packages/web`: `npx tsc --noEmit` → **FAIL**
3. `packages/cli`: `npx tsc --noEmit` → **FAIL**
4. `packages/shared`: `npx tsc --noEmit` → **FAIL**

Error (representative):

```text
Node: v12.17.0
.../node_modules/.../typescript@5.9.3/.../lib/_tsc.js:92
  for (let i = startIndex ?? 0; i < array.length; i++) {
                           ^
SyntaxError: Unexpected token '?'
```

## 4. Overall Assessment

**NOT_READY**

Reasons:
1. **Cannot run TypeScript typechecking in this environment** (Node v12 + TS 5.x runtime syntax).
2. Several spec mismatches beyond typecheck (notably US-006 review_queue uniqueness, US-010 entrypoint/middleware order, US-011 `/api/mcp` public route, US-015 default active filtering, US-019 extraction schema/evidence, US-027 test infra gaps, and multiple web “visual verification” criteria not executed).

## 5. Remaining Issues

1. Upgrade runtime Node to a modern LTS (recommend Node 18+; many deps here are already Node 18/20-era), then re-run:
   - `packages/api`: `npx tsc --noEmit`
   - `packages/web`: `npx tsc --noEmit`
   - `packages/cli`: `npx tsc --noEmit`
   - `packages/shared`: `npx tsc --noEmit`
2. US-006: reconcile `review_queue_pending_unique_entity_review_type` to match `docs/database-schema.md` / PRD (remove `review_type <> 'low_confidence'` or update the spec/docs intentionally).
3. US-010: align `packages/api/src/index.ts` vs `packages/api/src/app.ts` responsibilities (or update PRD); confirm intended middleware chain.
4. US-011: implement `/api/mcp` (or remove from acceptance criteria) and ensure it is a public route if required.
5. US-015/US-033: ensure “active by default” behavior is consistent in API and UI (`/api/projects` default filter vs requiring `?status=active`).
6. US-019/US-021: align Phase A schema to `docs/extraction-prompts.md` and ensure evidence fields + permalink computation meet the PRD.
7. US-027: implement the promised per-test transaction rollback (or update spec), add missing tests for shared/web/cli, and correct pnpm filter instructions.
8. US-037: add the missing floating action button if it’s still a requirement.
9. Perform the explicitly requested browser verification steps (PRD mentions “dev-browser skill”; not executed in this review).

