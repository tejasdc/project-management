# Clarify.pm: remove fixed hosting costs

## Status and authority

Research and proposed implementation, September 11, 2026. **Not implemented or
deployed.** Tejas's later request authorizes migration to Cloudflare free-tier
infrastructure and supersedes the earlier request to keep Render. Preserve the
existing product; stop for decisions that materially change behavior or data.

The unresolved owner decision is whether a new empty workspace is acceptable if
the old database cannot be recovered. The Render database is confirmed absent;
absence of every possible backup is not confirmed. A question is pending in the
request's Slack thread. Do not treat elapsed time as authorization to start fresh.

## Workload and required behavior

This is a hobby project used by its owner/a small trusted team. The current code
has one shared collection of projects and entities, not separate tenant databases.
Its data includes private raw notes, account credentials, source evidence, and
review history. Preserve those records if recoverable. There is no requirement
for enterprise scale, a permanently running server, or a separate Redis service.

The app must still support login and revocable API keys; quick capture; extraction
of tasks, decisions and insights; project/epic organization; low-confidence review;
entity status/history/tags/relationships; searching/pagination; and live UI updates.
Keep the React interface, Hono API contracts and current Anthropic prompts/model
configuration where compatible. Infrastructure migration is not permission to
replace extraction with a lower-quality model, drop review, or discard old data.

## What the existing services actually do

| Existing component | Required responsibility | Source evidence |
| --- | --- | --- |
| Render static frontend | Homepage and React application assets | `render.yaml:35`, `packages/web/src/components/Homepage.tsx` |
| Node Hono API | Validation, authenticated CRUD, API keys, capture, review | `packages/api/src/app.ts:143`, `packages/api/src/routes/auth.ts:31` |
| Postgres | Durable relational records, constraints and atomic edits across 12 tables | `packages/api/src/db/index.ts:11`, `packages/api/drizzle/0000_skinny_mathemanic.sql:9` |
| Redis/BullMQ | Persist and retry extraction, organization and reprocessing jobs | `packages/api/src/jobs/queue.ts:1`, `packages/api/src/worker.ts:33` |
| Redis pub/sub | Broadcast database-change notifications to API SSE subscribers | `packages/api/src/services/events.ts:4`, `packages/api/src/routes/sse.ts:7` |
| Redis rate-limit store | Failed-auth and capture counters | `packages/api/src/middleware/rate-limit.ts:62`, `packages/api/src/middleware/rate-limit.ts:78` |
| Dedicated worker process | Calls Anthropic and commits the results | `packages/api/src/jobs/notes-extract.ts:51`, `packages/api/src/jobs/notes-extract.ts:62` |

The three actual consumers are `notes-extract`, `entities-organize` and
`notes-reprocess`. Embedding/training-export queue accessors are declared but no
consumers for them are registered in `worker.ts`; they are not additional shipped
background features to recreate. Redis is not the source of truth for project data.

The database has users, API keys, projects, epics, raw notes, entities, source links,
entity relationships, tags, entity tags, review items and entity events. UUIDs,
foreign keys, enum/check constraints, partial unique indexes and JSON values must
survive conversion. Database triggers maintain `updated_at`; the migration also
declares a Postgres lineage function. Audit its consumers before deciding its port.
No deployed vector-search requirement was established by this investigation.

## Recommended implementation

Use **Workers static assets plus a SQLite-backed workspace Durable Object**. The
Worker serves the built frontend and forwards authenticated app operations to the
workspace owner. The Durable Object owns relational storage, a persistent job
table with alarms, rate-limit counters, and hibernating live-update WebSockets.
This replaces the API process, Postgres service, Redis service and worker process
with a Cloudflare deployment that sleeps when idle. No D1 or separate queue service
is required for this operating profile.

This follows the useful part of the existing chess app: its
`wrangler.jsonc` declares `AppDO`/`GameDO` with `new_sqlite_classes` and static assets.
Keep Clarify.pm's normalized tables; do not copy a whole-database JSON-blob design.
The personal site is the simpler comparison: `chann-app/AGENTS.md` identifies
Cloudflare Pages/static publishing, which by itself cannot run this app's jobs.

The workspace is the transaction boundary. Use the supported
[Drizzle Durable SQLite driver](https://orm.drizzle.team/docs/get-started/do-new)
and synchronous transactions for each atomic database operation. External AI calls
run outside transactions. Requests arriving while an AI fetch is pending must not
observe half-written results. A normal Worker has a much smaller free CPU allowance
than a Durable Object; do not run password hashing or the complete pipeline in the
stateless routing Worker. Verify real CPU use before release.

### Persistent processing contract

Save a captured note and its extraction intent atomically, then arm the next alarm.
Persist the processing generation, current step, next attempt, attempts and error.
An alarm runs the due work, validates the AI response and atomically commits the
result plus the next processing step. Extraction completion and organization intent
must commit together; a crash between them must not strand an already-processed note.

Repeat delivery of the same generation must not create duplicate entities or review
items. Explicit reprocess is a new generation and retains existing source/history
semantics. Only the active generation may commit its result after an external await.
Transient failure retries with a durable next-attempt time; terminal failure remains
visible and supports explicit retry. The alarm is rearmed whenever pending work or
its due time changes. Hibernation/restarts must not lose work. Provider requests can
still be repeated after an ambiguous network failure; do not promise exactly-once
Anthropic billing. Cloudflare [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
provide at-least-once execution, not application-level deduplication.

### Live updates, access and compatibility

Replace the browser's EventSource transport with authenticated, hibernating
WebSockets while retaining the event names and query invalidations. Reconnect
refreshes authoritative state. Socket authorization/revocation and logout must be
covered by tests. Do not log bearer credentials or place them in request URLs.
Cloudflare's [hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
keeps idle connections without keeping the object actively billed. Continuous SSE
or application timers would prevent the desired idle behavior.

Port bcrypt's native dependency without reducing password protection or invalidating
recoverable hashes. Keep API-key hashing and revocation semantics. The current code
allows public registration into a shared workspace; that is a concrete access risk
to resolve before exposing recovered/private data, not an implied multi-tenant SaaS
requirement. Authentication checks alone do not establish workspace authorization.

Port PostgreSQL enums, JSONB, timestamps, `ILIKE`, casts and triggers to SQLite
equivalents; preserve search behavior, ordering, cursors and transaction rollback.
Verify large filter sets against actual SQLite binding limits. Do not emulate
Postgres with string substitutions at runtime or weaken atomic updates.
The current capture validator (`packages/shared/src/schemas.ts:55`) accepts uncapped
note content; the review probe accepted 2,100,000 bytes. Cloudflare SQL strings/rows
have a 2 MB limit. Check recovered row sizes and the capture contract before the
storage port. Do not silently truncate/drop large notes or narrow accepted input;
preserve the contract through an appropriate storage representation, or bring a
necessary product limit back to the owner. Actual historical note sizes are unknown.

## Alternatives considered

| Option | Benefit | Cost/tradeoff for this project |
| --- | --- | --- |
| D1 + Queues + a live-update Durable Object | Native managed queue, convenient standalone SQL operations/exports | Viable free-tier option, but more bindings and a cross-service enqueue boundary; existing read/modify/write transactions need restructuring |
| Workspace Durable Object + SQLite + alarms | One durable writer for relational edits and job transitions; matches the small shared workspace | Requires a small explicit job lifecycle, synchronous transaction port, and operator export/recovery support |
| Keep Postgres on another free provider | Less SQL migration | Another provider/account, free-tier conditions and database lifecycle; does not achieve all-Cloudflare storage |
| Containers or resumed Render services | More of the Node deployment remains intact | Fails the no-fixed-hosting-fee objective or leaves paid infrastructure |

D1 and Queues are **not paid-only blockers**. D1 includes 5 million rows read/day,
100,000 written/day and 5 GB account storage on Free
([pricing](https://developers.cloudflare.com/d1/platform/pricing/)). Queues includes
10,000 operations/day with 24-hour retention on Free; ordinary delivery uses three
operations, plus reads for retries
([pricing](https://developers.cloudflare.com/queues/platform/pricing/)). Persistent
job intent must outlive that retention if that alternative is chosen.

## Free-tier feasibility and limits

[Static asset delivery](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
is free and unlimited when it bypasses Worker execution. Route only API and other
necessary dynamic paths through the Worker; retain SPA deep links and suitable
HTML caching. Workers Free includes 100,000 dynamic requests/day and 10 ms CPU per
ordinary request ([limits](https://developers.cloudflare.com/workers/platform/limits/)).

SQLite Durable Objects are available on Free: 100,000 requests/day, 13,000 GB-s/day,
5 million SQL rows read/day, 100,000 written/day and 5 GB account storage
([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)).
These are shared account allowances. Idle hibernation avoids duration usage; active
AI waits still use DO duration. The storage-limit page's error section specifies
1 GB/object on Free, though its summary table says 10 GB without the plan split;
budget to the conservative Free limit until provider/runtime confirmation
([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).

No paid plan or new paid subscription is authorized. Free quota exhaustion should
produce a visible error, not automatically upgrade billing. Exact remaining account
headroom and subscription status were not verified: the deployment token can list
Workers/storage but the account-subscriptions endpoint returns 403. The returned
Worker setting `default_usage_model: standard` alone does not establish the plan.

The existing Anthropic key passed a models-list and a tiny inference probe. Retain
it as a Worker secret. AI inference remains [separately metered](https://platform.claude.com/docs/en/about-claude/pricing);
free hosting does not make Anthropic free. The probe establishes current access,
not unlimited credit or validation of the full extraction/organization prompts.
Both `packages/api/src/ai/extraction.ts:6` and `organization.ts:6` default to
`claude-sonnet-4-20250514`. Anthropic [lists that model as retired June 15, 2026](https://platform.claude.com/docs/en/about-claude/model-deprecations)
and recommends `claude-sonnet-4-6`. Use a supported Sonnet model and verify both
existing structured-output prompts; a working key alone cannot revive a retired
model. This is a compatibility repair, not a switch to a cheaper model family.

## Data and domain preconditions

The independent Render audit confirmed no Postgres instances, HTTP 404 for
`dpg-d63tlvpr0fns73bsb5ag-a`, and no DNS resolution for its configured hostname.
That hostname is Render-internal, so DNS failure from this host is not proof of
absence by itself; the owning-workspace list and full-ID lookup are decisive.
The Redis and worker starter-plan resources remain suspended; the API is free and
unsuspended, and the static frontend is active. The Blueprint remains auto-syncing
`main`/`render.yaml`, including the absent database definition.

Existing records must be restored from a verified export, or the owner must choose
an empty workspace explicitly. No export was found in the current remote project,
related vault project, inspected archived project references, or the oldest/latest
remote-box snapshots (August 7 and September 11). Intermediate snapshots were not
exhaustively inspected. Possible laptop `backups/` and iCloud workspace backup
folders are not accessible here. Preserve any recovered export before transforming
it; verify counts, IDs, hashes, timestamps, relationships and foreign keys in an
isolated target. The detailed session audit is in `tmp/reviews/render-recovery.md`;
this paragraph preserves its decision-relevant findings after scratch cleanup.

The active Cloudflare credential sees four zones: chann.app, tejas.nyc, thnkr.ing
and twochairs.club. `clarify.pm` still delegates to dns-parking.com nameservers and
is not visible in this account. A Workers preview can use the account's `thnkring`
workers.dev subdomain. Retaining `https://clarify.pm/` requires registrar/DNS control;
do not claim a workers.dev deployment completes the canonical-domain migration.
Preserve `https://api.clarify.pm/` as well: it is the current frontend API origin
(`render.yaml:43`) and may be configured in CLI clients. Route its API paths to the
same backend, retain required CORS behavior, and verify TLS plus authenticated
requests there before retiring Render. A same-origin browser client must not strand
existing direct API clients. Changing that public API origin requires a deliberate
compatibility decision.
Preserve the full existing DNS zone, including unrelated mail/TXT records, if
nameservers change. Do not switch the portfolio to a temporary URL.

## One complete delivery and acceptance

The implementation is one whole migration: runtime, storage, jobs, live updates,
auth compatibility, data handling, deployment, docs and verification together.
Before implementation, run the required consequential-design review. Before
release, review the actual integrated diff at High-risk depth for the named risks:
data preservation, public authorization/secret handling, job lifecycle and deployment
ownership. Hypothetical SaaS scale and unrelated redesigns are non-blocking.

Required evidence: atomic rollback; deduplicated capture/retries; restart during AI
work; extraction and organization with source evidence; review accept/reject/modify;
reprocess; projects/epics/entities/history/search/pagination; valid/invalid/revoked
keys; unauthorized live connections; logout/reconnect; secret-free logs/assets;
and idle hibernation. Use the same behavioral API coverage on the Cloudflare runtime,
plus the repository build/typecheck/test gates. Browser acceptance uses Chromium
and WebKit on Linux at desktop and phone viewports, including restored deep links.

Before any main-branch integration that changes deployment configuration, detach or
disable the Render Blueprint's automatic reconciliation using its supported control
plane. Preserve metadata needed for rollback. Do not reactivate paid services.
Keep the Render homepage available until the complete Cloudflare app passes live
acceptance. Then verify apex and API-hostname DNS/TLS, login, a real capture through both AI
steps, review, live updates and reload persistence. Only then remove the offline
notice and retire the obsolete deployment references/services through supported APIs.

Rollback before cutover leaves Render's existing homepage and data artifacts intact.
After new captures exist, rollback must preserve/export the new SQLite state and use
a compatible Worker version; pointing at the missing Render database is not a
working application rollback. Do not overwrite newer data with an old snapshot.

## Investigation scope

Read the schema, queue wiring, processors, event transport, authentication, rate
limits, representative service/route implementations, migrations, hosting runbook,
and relevant sections of the large product docs. No built-in LSP tool was available;
text-level cross-checks used `rg`. A verification search across `packages` examined
137 files and found 61 Redis/BullMQ/lineage-related matches in 24 files. This is an
inventory, not proof that every route already works on Cloudflare. No application
runtime code, production data, DNS, subscription or deployment changed in the audit.

Baseline verification passed on the unmodified runtime: shared build; API, shared
and web typechecks; 87 API tests across eight files; web production build. These
tests use the existing Postgres/test mocks, not the proposed Cloudflare runtime or
live Anthropic extraction. Frontend visual verification is not repeated for this
documentation-only change; it remains a migration release requirement.
The required advisory spec check identified the uncapped-note/SQLite-row limit,
API-hostname preservation, and stale paid-service-resumption guidance. All three
are now recorded or corrected here and in the hosting runbook. This is a research
fact check, not the consequential-design or implementation release review.
