# Clarify: product recovery and hosting

Investigated on 2026-09-11 from remote-box. Source repository:
`tejasdc/project-management`, available at `/root/workspace/project-management`.

## Current decision

Tejas's 2026-09-11 follow-up cancels the Cloudflare migration: **keep both the app and
the marketing homepage on Render, at `https://clarify.pm/`.** The portfolio link uses
that canonical domain. The marketing homepage source is ready in `landing/`, but its
Render deployment is pending access to the workspace owning Clarify's existing services.
The Cloudflare comparison below is historical research, not an implementation plan.

## What the project is

Clarify is a project-management experiment built around quick, unstructured capture.
The implemented pipeline stores a raw note, extracts **tasks, decisions, and insights**,
and organizes them into projects and epics. Extracted items retain source evidence;
uncertain suggestions go to review. The three-type model was deliberate: avoid turning
every sentence into a collection of redundant entities.

The source docs are `docs/project-management-agent.md`, `docs/frontend-views.md`, and
`docs/extraction-prompts.md`. There was no README at the time of recovery. Selected
product/design sections were read, not every line of these large documents.

Archived February session summaries under
`/root/transcript-archive/mac-claude-projects/-Users-tejasdc-workspace-project-management/`
recover the original goals: capture without manual annotation, let agents organize,
keep human review, and preserve the original material. In particular,
`f257875a-ad4a-48a8-8afa-82f211c705f6/subagents/agent-acompact-b2a1c4.jsonl`
and `agent-acompact-97bc98.jsonl` record the early product and hosting decisions.
These are compacted session summaries, not complete original transcripts. The broader
vision of tracking work evolution through git and agent activity is not represented
as a working feature on the homepage.

## Current production evidence

| Surface | Observed result |
| --- | --- |
| `https://clarify.pm` | HTTP 200, PM Agent login screen, Render `rndr-id` response header. |
| `https://api.clarify.pm/api/health` | Repeated timeouts; the longest was 55 seconds with zero HTTP response bytes after successful TCP/TLS. |
| Direct Render API hostname | `pm-api-lxwo.onrender.com` also timed out. |
| API DNS | CNAME points to `pm-api-lxwo.onrender.com`, then Render's origin. |
| Authoritative DNS | `ns1.dns-parking.com` and `ns2.dns-parking.com`. |
| Cloudflare account | Existing token lists chann.app, tejas.nyc, thnkr.ing and twochairs.club; clarify.pm is not visible. |

The frontend being up does **not** establish that login, capture, extraction, or data
storage works. No root cause is confirmed. `server: cloudflare` reflects delivery
infrastructure, not evidence that Clarify is hosted in Tejas's Cloudflare account.

`render.yaml` defines a static web frontend, Hono Node API, BullMQ worker, Valkey/Redis,
and Postgres 17. The available Render credential authenticates but cannot see any of
the five named resources. Visible services belong to the IdeaFlow workspace. Current
backend, worker, database, and Redis health remain unknown; an empty service listing
does not prove deletion. Access to the Clarify-owning Render workspace is needed to
inspect logs and determine whether the database can be exported.

## Homepage source and temporary preview

`landing/` is a dependency-free public homepage with a labeled worked example,
keyboard-operable source highlighting, light/dark themes, self-hosted fonts, and no
network-backed capture or sign-up flow. It makes no claim that the old app is healthy.
It was published independently as Cloudflare Pages project `clarify-homepage`, at
`https://clarify-homepage.pages.dev`, before the hosting correction. That temporary
preview is not the canonical product URL. Do not continue deploying the homepage there.
Its publication changed neither the existing app routes nor DNS nor user data.

Inspect the real `pm-web` Render configuration and integrate the prepared homepage
without breaking the existing authenticated app routes. The checked-in blueprint currently
builds only `packages/web`; pushing `landing/` alone does not publish it on Render.
Retire the temporary preview after the Render homepage is verified. Never publish the
repository root: it contains private code and operational documentation.

Docs-only and preparation commits use `[skip render]` until the actual deployment is
inspected; this is Render's documented
[skip mechanism](https://render.com/docs/deploys#skipping-an-auto-deploy).

## Access needed next

The current Render credential authenticates but does not expose Clarify's resources.
Provide API access from the account/workspace that owns `pm-web`, `pm-api`, `pm-worker`,
`pm-db`, and `pm-redis`, or the corresponding renamed services. A workspace/dashboard
link helps identify them. Keep tokens out of Slack; use an authenticated Render session
or a protected local credential file. Do not overwrite the existing IdeaFlow credential.

`clarify.pm` and `api.clarify.pm` already point to Render. No DNS migration or DNS
credentials are required merely to inspect the services or deploy to the existing site.
After access is restored, inspect deployment and environment state, check Postgres and
Redis, verify the worker's existing Anthropic credential, and exercise login, capture,
extraction, organization, review, and live updates with a dedicated test account.
Only request another service credential if that inspection proves it missing or invalid.

## Historical Cloudflare assessment (canceled)

Yes in principle, but the full app needs adaptation rather than a hosting switch.

| Current part | Cloudflare option | What would change |
| --- | --- | --- |
| Static React/Vite frontend | Workers static assets or Pages | Build and route configuration; API origin and CORS must match. |
| Hono Node API | Workers | Request lifecycle, bindings, authentication hashing/native dependency compatibility, and database connections need review. |
| Postgres + Drizzle | D1 for Cloudflare-owned storage | D1 uses SQLite semantics. Migrate schema, SQL, indexes, data and transactions; verify identifiers and source relationships survive. |
| Keep Postgres temporarily | Hyperdrive | Connects to an existing Postgres database; it does not move that database onto Cloudflare. |
| BullMQ + Redis worker | Cloudflare Queues and consumers | Port extraction/organization jobs, retries, deduplication and scheduling. Queues is not a BullMQ/Redis drop-in. |
| Redis pub/sub for SSE | Durable Objects or another supported event distribution design | Preserve authenticated per-user subscriptions and cross-worker updates. |

Containers may preserve some Node compatibility, but their ephemeral disks are not a
durable Postgres plan. The appropriate migration depends on the actual database state,
data volume, and remaining application requirements, which are not yet established.

Before a full migration, recover target Render access and inventory/export the existing
data, establish the working authentication and capture baseline, then review one complete
migration design with rollback and acceptance checks. No production data migration,
database replacement, service shutdown, or nameserver change was performed in this work.

Official references: [React on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/),
[D1](https://developers.cloudflare.com/d1/),
[Hyperdrive](https://developers.cloudflare.com/hyperdrive/),
[Queues consumers](https://developers.cloudflare.com/queues/configuration/javascript-apis/),
[Containers architecture](https://developers.cloudflare.com/containers/concepts/architecture/).

## Visual asset provenance

`landing/assets/notes-to-order.webp` was generated with the built-in image tool, then
encoded to WebP. Prompt: an editorial, slightly overhead still life of loose off-white
paper notes becoming three organized stacks on a dark graphite tabletop; tactile paper,
soft oblique studio light, subtle amber/blue/sage tabs, no legible words, logos, computers,
or interface. It is an atmospheric concept image, not a screenshot of the app.
Bricolage Grotesque and DM Sans are self-hosted from Google Fonts under their included
SIL Open Font Licenses.
