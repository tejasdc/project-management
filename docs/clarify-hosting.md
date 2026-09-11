# Clarify.pm: product recovery and hosting

Investigated on 2026-09-11 from remote-box. Source repository:
`tejasdc/project-management`, available at `/root/workspace/project-management`.

## Current decision

Tejas's 2026-09-11 follow-up cancels the Cloudflare migration: **keep both the app and
the marketing homepage on Render, at `https://clarify.pm/`.** The portfolio link uses
that canonical domain. The marketing homepage source is in `packages/web/src/components/Homepage.tsx`
and the existing Render frontend serves it at the public root route.
The Cloudflare comparison below is historical research, not an implementation plan.

## What the project is

Clarify.pm is a project-management experiment built around quick, unstructured capture.
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

## Production investigation evidence (before homepage deployment)

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

The new credential in `~/.config/render/clarify.env` accesses the owning **personal**
workspace, `tea-d63tgvp4tr6s73a4e3q0`. Do not overwrite the separate IdeaFlow credential.
Confirmed on September 11:

- `pm-web` (`srv-d63tlvhr0fns73bsb560`) is a static site on `main` with verified
  `clarify.pm` and `www.clarify.pm`; www redirects to the apex. No DNS change is needed.
- `pm-api` (`srv-d63tmipr0fns73bsbcu0`) is running and logging Redis connection refusals.
- `pm-worker` (`srv-d64ftfogjchc739nejpg`) and `pm-redis`
  (`red-d64fsbf5r7bs73af5u4g`) are suspended. Both were last updated June 5.
- No Postgres instances are listed. The configured resource's full ID,
  `dpg-d63tlvpr0fns73bsb5ag-a`, also returns 404. Archived Render metadata identifies
  a free database created February 8 with `expiresAt` March 10. Expiry is likely;
  the exact removal event is unconfirmed.
- No completed dump or replacement database was found in this project's remote files
  and archived sessions. The remaining local candidate is the laptop's ignored
  `/Users/tejasdc/workspace/project-management/backups/` directory.
- API and worker database, Redis, and Anthropic environment variables are present.
  Presence is not evidence of validity. Login/capture/extraction acceptance is blocked.

Do not silently create an empty replacement database, restore over unknown data, or
resume paid services. Recover an existing export if available; otherwise obtain the
owner's decision about starting fresh and the resulting costs. Render's general
[free database policy](https://render.com/docs/free#free-postgres) provides a 14-day
grace period after expiry, not a verified recovery path for this instance.

## Homepage source and temporary preview

`packages/web/src/components/Homepage.tsx` is the public homepage with a labeled worked example,
keyboard-operable source highlighting, light/dark themes, self-hosted fonts, and no
network-backed capture or sign-up flow. It makes no claim that the old app is healthy.
It was published independently as Cloudflare Pages project `clarify-homepage`, at
`https://clarify-homepage.pages.dev`, before the hosting correction. That temporary
preview is not the canonical product URL. Do not continue deploying the homepage there.
Its publication changed neither the existing app routes nor DNS nor user data.

The inspected `pm-web` build command is:

```
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @pm/shared build && pnpm --filter @pm/web build
```

The publish directory is `./packages/web/dist`. Its build filter covers `packages/web/**`,
`packages/shared/**`, and `pnpm-lock.yaml`. Keeping the homepage inside `packages/web`
makes subsequent homepage changes use that existing deployment path.

The existing root route renders `Homepage.tsx` outside AuthGate; all other app routes
retain AuthGate and the existing query/SSE providers. The homepage uses self-hosted
fonts and a local React state for its illustrative selection; it makes no API calls.
App-only Google font links load only on app routes. Static files under
`packages/web/public/homepage/` are included by Vite's existing build. Render's
`/*` → `/index.html` rewrite remains unchanged.

Deploy through the existing frontend's main branch. Verify the canonical homepage,
keyboard example, and direct app URLs. Rollback uses the prior frontend deployment;
no DNS, rewrite, or backend rollback is involved. Do not redeploy the API to ship this
page: its build runs migrations and seeding.

**Blueprint constraint:** `exs-d63thkkr85hc73bfn9i0` has auto-sync enabled and still
declares the missing database. Render's documented [Blueprint behavior](https://render.com/docs/infrastructure-as-code)
recreates deleted resources on sync. Leave `render.yaml` unchanged and do not sync it
until database recovery/replacement is decided. The homepage uses the existing frontend
configuration and does not need a Blueprint change.

Retire the temporary preview after the Render homepage is verified. Never publish the
repository root: it contains private code and operational documentation.

Docs-only and preparation commits use `[skip render]` until the actual deployment is
inspected; this is Render's documented
[skip mechanism](https://render.com/docs/deploys#skipping-an-auto-deploy).

## Credential location

Use `~/.config/render/clarify.env` on remote-box with `RENDER_API_KEY` set and file
permissions `600`. Access to the owning personal workspace was confirmed. Keep tokens
out of Slack and reports; share only the path. The separate IdeaFlow key cannot see
these services. Render keys inherit their account's workspace memberships.
[Create/manage API keys](https://dashboard.render.com/u/settings?add-api-key=),
[authentication contract](https://api-docs.render.com/reference/authentication).

`clarify.pm` and `api.clarify.pm` already point to Render. No DNS migration or DNS
credentials are required merely to inspect the services or deploy to the existing site.
After database recovery is resolved and the existing Redis/worker are resumed, verify
the worker's existing Anthropic credential, and exercise login, capture,
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

`packages/web/public/homepage/assets/notes-to-order.webp` was generated with the built-in image tool, then
encoded to WebP. Prompt: an editorial, slightly overhead still life of loose off-white
paper notes becoming three organized stacks on a dark graphite tabletop; tactile paper,
soft oblique studio light, subtle amber/blue/sage tabs, no legible words, logos, computers,
or interface. It is an atmospheric concept image, not a screenshot of the app.
Bricolage Grotesque and DM Sans are self-hosted from Google Fonts under their included
SIL Open Font Licenses.
