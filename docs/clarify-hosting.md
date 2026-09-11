# Clarify: product recovery and hosting

Investigated on 2026-09-11 from remote-box. Source repository:
`tejasdc/project-management`, available at `/root/workspace/project-management`.

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

## Homepage delivery

`landing/` is a dependency-free public homepage with a labeled worked example,
keyboard-operable source highlighting, light/dark themes, self-hosted fonts, and no
network-backed capture or sign-up flow. It makes no claim that the old app is healthy.
It is hosted independently as Cloudflare Pages project `clarify-homepage`, at
`https://clarify-homepage.pages.dev`. Publishing it changes neither the existing app
routes nor DNS nor user data.

Deployment from remote-box, after loading `~/.config/cloudflare/deploy.env`:

```sh
npx wrangler pages deploy landing --project-name clarify-homepage --branch main
```

Use the existing shared Cloudflare deployment token. Do not create a project-specific
token. To roll back, redeploy `landing/` from a previous verified Git commit. Never
deploy the repository root: it contains private code and operational documentation.
Homepage-only commits use `[skip render]` so they can be integrated into `main`
without triggering the old app's automatic deploy; this is Render's documented
[skip mechanism](https://render.com/docs/deploys#skipping-an-auto-deploy).

Before moving the apex, obtain access to its current DNS provider, preserve the complete
zone including email records, and decide where the existing app will remain reachable.
The static preview is usable without resolving that ownership boundary.

## Can everything move to Cloudflare?

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
