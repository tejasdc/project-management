# Clarify.pm — Project Instructions

## Product and operating profile

Use the full product name **Clarify.pm**. This is one shared workspace for its owner
and invited teammates, not a multi-tenant SaaS. Raw notes are private. Keep capture,
AI extraction/organization, source evidence, human review and live updates intact.
The owner authorized a fresh empty workspace/new login on September 11, 2026
(Slack message 1789173009.272589), superseding the earlier Render-only decision.

## Runtime

- Frontend: Vite + React + TanStack Router/Query + Tailwind/shadcn in packages/web.
- API: Hono inside the SQLite-backed Workspace Durable Object in packages/api.
- Worker entry: packages/api/src/worker.ts; configuration: wrangler.jsonc.
- Data and jobs: normalized SQLite tables, immutable raw-note pages, processing_jobs,
  and Cloudflare alarms. No Redis, Postgres, BullMQ or separate worker process.
- AI: existing Anthropic extraction/organization prompts, supported Sonnet 4.6.
  Inference is separately metered; free hosting does not make AI calls free.

The workspace Durable Object is the durable writer. Runtime dependencies resolve
through AsyncLocalStorage; never keep a mutable module-global database/client shared
across objects. Drizzle read/modify/write transactions must be synchronous: use
.sync() for relational queries, .all()/.get() for results and .run() for writes.
External AI calls run outside transactions. Preserve generation checks before committing
AI results. Commit extraction results and organization intent together. Capture and
reprocess use mutateAndWake: SQLite writes and the alarm share a storage transaction.
Alarms reconcile their next wake transactionally and stop when no work remains.
Epic suggestions must reference an active project supplied to the model; discard
unknown project IDs before either automatic creation or human review. New-project
suggestions use entityIndices and have no temporary-ID contract.

Immutable note payloads (content plus sourceMeta) are UTF-8 document pages, ordered
by note ID/page. Concatenate bytes before decoding. The API hydrates the original
shape; never return internal empty inline fields or truncate large payloads.
SQLite enums use explicit checks, references retain cascade/set-null behavior,
and updatedAt uses Drizzle's on-update hook. Large ID sets use JSON table queries
instead of one SQL parameter per ID.

## Authentication and live updates

Registration requires the REGISTRATION_CODE Worker secret. Every invited account
shares the workspace. Passwords use bcryptjs cost 12; API keys use SHA-256 hashes.
Return safe user projections; never expose passwordHash or keyHash. Public API paths
are /api/health, /api/auth/register and /api/auth/login. All other routes authenticate.

Live notifications use /api/live WebSockets and the hibernation API. The browser
sends its API key in the WebSocket protocol header, never in a URL. The accepted
protocol is clarify. Socket attachments contain only key IDs; revocation closes
matching sockets. Reconnect invalidates queries, and logout closes the connection
and clears cached private data. Do not add recurring browser/server keepalives.
Logs allow only operational fields; never serialize SDK errors, headers or note text.
Auth throttling counts completed failed authentication attempts, never concurrent
successful dashboard reads. Organization recovery clears note errors transactionally
and always publishes a note notification, including when no assignments change.

## Hosting and release

Canonical product URL: https://clarify.pm/; keep the portfolio link there.
The clarify-pm Worker serves the complete application. Its configured custom domains
are clarify.pm, www.clarify.pm and api.clarify.pm, sharing the same Workspace object.
www page/API requests redirect to clarify.pm with their path and query preserved.
Page requests pass through the Worker for canonical redirects; /assets/* and
/homepage/* bypass execution. The browser uses same-origin /api requests.
See docs/clarify-hosting.md for DNS cutover state, acceptance and rollback.
Verify Cloudflare always_use_https=on before activating custom domains; domain
ownership and DNS permissions do not include Zone Settings access. Preserve HTTPS
enforcement and probe HTTP redirects without credentials before live sign-in.

Use only ~/.config/cloudflare/deploy.env for deployment credentials.
Render personal credentials: ~/.config/render/clarify.env. Existing static service:
srv-d63tlvhr0fns73bsb560. Blueprint exs-d63thkkr85hc73bfn9i0 auto-sync and old API/worker
auto-deploys were disabled and verified before changing deployment configuration.
Never resume paid resources or restore the old Blueprint. Render is only a rollback
and DNS-cache fallback during domain cutover; its frontend must not auto-deploy after
Cloudflare acceptance. Retain that free fallback while old DNS answers can be cached.

Publish packages/web/dist only. Homepage: packages/web/src/components/Homepage.tsx,
assets: packages/web/public/homepage/. The example is illustrative, never an API call.
The root is public; app routes retain AuthGate. Canonical live acceptance passed on
September 11, 2026: login/capture, real Sonnet extraction and organization, review,
source persistence and live updates. The homepage now links to Open workspace.
A frontend HTTP 200 alone is insufficient for subsequent runtime releases.

## Verification and worktrees

Node 22+. scripts/worktree-bootstrap.sh installs locked dependencies and builds shared.
The wt manager owns ignored environment copying; bootstrap starts no services.
Run:
- corepack pnpm --filter @pm/shared build
- corepack pnpm -r run typecheck
- corepack pnpm --filter @pm/api test
- corepack pnpm --filter @pm/web build
- node scripts/test-worker.mjs
- Browser acceptance in Chromium and WebKit on Linux at 1440×1000 and 390×844.

API tests use a separate in-memory SQLite fixture per test file and run in parallel.
Native tests run the actual bundled Worker/SQLite/alarms/WebSockets in Miniflare.
Only that test config enables storage inspection; never add test/admin routes to
production. Run focused failing tests during repairs and integrated gates before release.

Keep the local run-tests, spec-check, verify-frontend and pre-deploy skills aligned
with this runtime. Spec-check requires an independent advisory check of product drift.
Consequential architecture and integrated high-risk release reviews follow global
risk-based review rules. Delegate production log investigations to a bounded agent;
direct release probes and live acceptance remain the delivering agent's work.
The legacy render-debug command now routes diagnostics to the current Cloudflare
runtime; its provider and credential authority is docs/clarify-hosting.md.

## Safety and library rules

Never deploy temporary admin/debug/cleanup endpoints, query-string authentication,
hardcoded secrets or destructive SQL in routes. One-off data operations use provider
storage tooling and documented backups, not a new HTTP endpoint. Review queue inserts
retain onConflictDoNothing for retry safety. Use Zod v4 z.toJSONSchema, never
zod-to-json-schema. TanStack Router foo.tsx is a layout; foo.index.tsx is its index.
Legacy Postgres migrations remain historical reference only and must not be run
against the Cloudflare app. New schema migrations live in packages/api/drizzle-sqlite.
