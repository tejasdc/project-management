# Final Review (ralph/project-management-agent)

Scope: Verified the 21 gaps listed in `REVIEW.md` against current source on branch `ralph/project-management-agent` (head commit `ea5f0cf`), cross-checked against `prd.json` + `docs/*.md`, and looked for regressions introduced by the fixes.

## Summary Table

| Story ID | Status | Notes |
|---|---|---|
| US-008 | VERIFIED | DB client is `drizzle-orm/node-postgres` + `pg` (`packages/api/src/db/index.ts`). `db:studio` script exists (`packages/api/package.json`). |
| US-010 | VERIFIED | `AppType` exported (`packages/api/src/app.ts`) and `packages/api/src/server.ts` exists. Health check is public and has 5s timeouts; however on degraded it still returns `timestamp` + `checks` (PRD calls for `{ status: "degraded" }` only). |
| US-011 | VERIFIED | `generateApiKey()` returns `{ plaintextKey, keyHash }`, uses `pm_live_` prefix, and `validateApiKey()` exported (`packages/api/src/services/auth.ts`). Middleware delegates to `validateApiKey` and supports SSE via `?apiKey=` for EventSource (`packages/api/src/middleware/auth.ts`). |
| US-014 | VERIFIED | `AppError` + factories exist and error envelope is consistent (`packages/api/src/lib/errors.ts`). Request logging includes `requestId` and `userId` (`packages/api/src/app.ts`), but non-request logs don’t automatically include those fields (logger is still a plain `pino()` instance in `packages/api/src/lib/logger.ts`). |
| US-015 | VERIFIED | Cursor pagination implemented for projects (`packages/api/src/services/projects.ts`) and epics (`packages/api/src/routes/epics.ts`). `parseLimit()` defaults `maxLimit` to `100` (`packages/api/src/lib/pagination.ts`). |
| US-017 | VERIFIED | Dedup hit does **not** enqueue extract job (`packages/api/src/services/capture.ts`), with explicit test coverage (`packages/api/tests/capture-idempotency.test.ts`). |
| US-018 | VERIFIED | Required queues are defined (`packages/api/src/jobs/queue.ts`) and `BULLMQ_CONCURRENCY` is honored (`packages/api/src/worker.ts`). Note: no workers/processors are implemented for `entities:compute-embeddings` or `review-queue:export-training-data` yet (queues exist only). |
| US-019 | VERIFIED | Retry-on-Zod-failure implemented (`packages/api/src/ai/extraction.ts`). System prompt includes 3 few-shot examples. `tokenUsage` + `extractedAt` captured and stored via `aiMeta` (`packages/api/src/jobs/notes-extract.ts`). Spec mismatches: `prd.json` says evidence includes `confidence`, but current evidence shape is quote/offset/permalink (matches `docs/extraction-prompts.md`); confidence is represented via `aiMeta.fieldConfidence`. Also PRD calls for `{ input, output }` token usage keys, but implementation uses `{ inputTokens, outputTokens, ... }`. |
| US-020 | VERIFIED | Phase B few-shot example included and Zod retry-on-failure exists (`packages/api/src/ai/organization.ts`). |
| US-021 | VERIFIED | `rawNoteId` injected into evidence, `permalink` copied from `raw_notes.source_meta.permalink` (`packages/api/src/jobs/notes-extract.ts`), review items created for any low field confidence via iteration. Note: “permalink derivation” beyond pass-through (e.g. Obsidian path → link) is not implemented. Deterministic Zod mismatch is discarded immediately (not “after N tries”). |
| US-022 | VERIFIED | Duplicate detection preserves full candidate list in `aiSuggestion.duplicateCandidates` while choosing a “best” target (`packages/api/src/jobs/entities-organize.ts`). Epic suggestion confidence comes from model output (schema includes `confidence`; fallback default remains 0.85). |
| US-023 | VERIFIED | Review queue endpoint implements default batching/sorting order when no cursor is provided (`packages/api/src/routes/review-queue.ts`). |
| US-024 | VERIFIED | Resolution cascades correctly: rejected assignment clears fields; type change reconciles and auto-rejects **all** other pending reviews for the entity; epic creation spawns follow-up epic assignment reviews (`packages/api/src/services/review.ts`). Covered by tests (`packages/api/tests/review-resolution.test.ts`). |
| US-027 | VERIFIED | Vitest workspace config exists (`vitest.workspace.ts`, `packages/api/vitest.config.ts`) with testcontainers Postgres setup + helpers/factories (`packages/api/tests/*`) and runnable scripts (`package.json`, `packages/api/package.json`). Note: no coverage thresholds configured yet. |
| US-029 | VERIFIED | CLI outputs tables via `cli-table3` for list commands and interactive review flow is not raw JSON (`packages/cli/src/index.ts`). |
| US-030 | VERIFIED | `pm session-sync` exists and scans `~/.claude/projects` uploading files with stable `externalId` (sha256 of path+mtime), with `--since` and `--dry-run` (`packages/cli/src/index.ts`). |
| US-031 | STILL_BROKEN | Hono RPC client is strongly typed and `src/components/ui/` exists, but TanStack Router is still manually declared (no actual file-based routing generator) and most query error states still don’t provide explicit “retry” buttons as required by PRD (`packages/web/src/router.tsx`, routes). |
| US-032 | VERIFIED | “Modify” action implemented in `ReviewCard` (`packages/web/src/components/ReviewCard.tsx`). |
| US-033 | VERIFIED | Project list shows stats by fetching dashboards; project dashboard has entity filters persisted in URL, and an “Ungrouped entities” section (`packages/web/src/routes/projects.tsx`, `packages/web/src/routes/projects.$projectId.tsx`, `packages/api/src/services/projects.ts`). |
| US-034 | VERIFIED | Entity detail shows project/epic/assignee, type-specific attributes, clickable evidence permalinks, inline status dropdown, and add-comment form (`packages/web/src/routes/entities.$entityId.tsx`). |
| US-035 | VERIFIED | SSE endpoint streams required events (`packages/api/src/routes/sse.ts`) via Redis pub/sub bus (`packages/api/src/services/events.ts`). Web connects with `EventSource`, has explicit exponential-backoff reconnection, invalidates queries, and sidebar badge uses a real count (`packages/web/src/components/SseProvider.tsx`, `packages/web/src/components/layout/Sidebar.tsx`, `packages/api/src/routes/review-queue.ts`). |

## Critical Issues Remaining

- **US-031 (PRD)**: “File-based routing” and query retry buttons are not implemented as specified. This is a spec miss, not a runtime correctness issue, but it is still an unresolved PRD acceptance criterion.

## TypeScript Compilation

- `packages/api`: `npx tsc --noEmit` passes when run under Node `v22.21.1`.
- `packages/web`: `npx tsc --noEmit` passes when run under Node `v22.21.1`.

Environment note: invoking `npx tsc` with Node `v12.17.0` fails (syntax errors in modern JS emitted by toolchain). The repo’s toolchain effectively requires a modern Node (>= 18).

## Overall Assessment

**NOT READY** (strictly against `prd.json`) due to unresolved **US-031** acceptance criteria (file-based routing and query retry UX).

If you treat US-031’s remaining items as non-blocking polish (since the app is functional and the previously “Critical Issues” from `REVIEW.md` are addressed), then the backend + core workflows look **READY** from a correctness perspective.
