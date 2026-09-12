# Clarify.pm hosting

The owner authorized Cloudflare migration and a fresh empty workspace on September
11, 2026. The old Render Postgres resource was absent (owning-workspace list empty,
full resource lookup 404); no verified export was found. Preserve any later recovered
backup separately. It must never overwrite new captures.

Published and verified September 11, 2026 (September 12 UTC). Runtime source:
ca4943df3ec1335c020b33684773d4fd9963b618. Cloudflare namespace:
c1b400df5e104604980b3aacff1e61b9 (clarify-pm_Workspace, use_sqlite=true).
The first canonical frontend deployment was dep-daiakaad0e5s73fvhfqg.
GitHub CI passed. Local gates: 89 API tests, 10 native runtime tests, all package
typechecks, web build and four browser configurations.

Live acceptance from https://clarify.pm passed real Sonnet capture/extraction and
organization, source links, project assignment and human review. Login, persistent
AI note, live WebSocket updates and logout then passed Chromium and WebKit on Linux
at 1440×1000 and 390×844. The homepage offline notice was removed after acceptance.
Verification uses a clearly named migration account/project; its immutable test note
remains release evidence, its projects are archived and its API keys are revoked.

## Architecture and costs

The Cloudflare Worker serves frontend assets and forwards API requests to one
SQLite-backed Workspace Durable Object. It owns relational data, processing jobs,
rate limits and hibernating live connections. Alarms run extraction and organization.
No paid Postgres, Redis or persistent worker instance is needed.

Workers/Durable Objects have free quotas shared with the account's other projects.
No paid plan or subscription was enabled by this migration. Built JS/CSS assets and
homepage images bypass Worker execution. Pages enter the Worker for www redirects.
Idle WebSockets hibernate, and idle job processing has no timer.
Anthropic inference remains separately charged through the existing key. R2 is not
used: its included allowance would not provide a hard zero-charge storage limit.

The existing extraction model was retired; the compatible supported default is
claude-sonnet-4-6. Existing prompts, tool schemas, evidence and review behavior remain.

## URLs and access

- Product: https://clarify.pm/
- API compatibility hostname: https://api.clarify.pm/
- Provider app/API URL: https://clarify-pm.thnkring.workers.dev/

On September 12, 2026, the domain moved from ns1/ns2.dns-parking.com to
chuck.ns.cloudflare.com and nena.ns.cloudflare.com. Both the authoritative parent
and Cloudflare confirm activation. Zone 50540e5498009dda9b9cb0f9f8b47a43 uses the
Free Website plan. The owner supplied a Hostinger API token at
/root/workspace/hostinger.txt (restricted to mode 600). API access works with curl;
Hostinger rejects Python urllib's default client signature before authentication.
The full Hostinger export contains three active records: apex A 216.24.57.1,
www CNAME pm-web-xqnz.onrender.com and api CNAME pm-api-lxwo.onrender.com.
There are no MX/TXT records, and the parent publishes no DNSSEC DS record.
The three records were copied to Cloudflare without proxying before changing delegation.
The original zone and domain response are backed up under backups/domain-2026-09-12/
in the migration worktree, with root-only permissions and excluded from Git.

The same deployment token now has the required Zone Settings permission.
Always Use HTTPS was enabled and independently read back as on at 18:49:01 UTC,
before attaching domains. The independent cutover review returned SHIP.
At 18:51 UTC, the three exact backed-up Render records were replaced with
Cloudflare-managed custom-domain records for the existing clarify-pm Worker.
The Worker deployment is 82419030-d821-4114-8496-2b13d3b6924c, source 7d75e4f.
All three hostnames share the unchanged Workspace namespace and object.
The frontend uses same-origin /api and wss://clarify.pm/api/live.

Credential-free public probes passed valid TLS, HTTP-to-HTTPS redirects on every
hostname, www canonical redirects preserving paths and queries, SPA deep links,
database health and anonymous API rejection. GitHub CI passed the release commit;
local gates passed 89 API tests, 11 native tests, typechecks and the web build.
Old DNS answers may still reach the free Render static fallback for up to four hours.
That fallback already calls the Cloudflare API and has auto-deploy disabled.

New registrations require the workspace invitation code. Each invited account sees
the same workspace. The code is a Worker secret, never a frontend environment value.
The owner creates their own account; migration acceptance accounts are clearly
identified and their API keys are revoked after testing.

## Deploy

Use the canonical token/environment in ~/.config/cloudflare/deploy.env. Build shared
and web, pass the API/native/browser checks, then run scripts/deploy-cloudflare.sh.
Worker secrets are ANTHROPIC_API_KEY and REGISTRATION_CODE; never commit them or use
Wrangler OAuth. All runtime data belongs to this Worker's own Workspace namespace.

Render control remains available with ~/.config/render/clarify.env (personal workspace,
separate from IdeaFlow). The migration disabled and verified:
- Blueprint exs-d63thkkr85hc73bfn9i0 autoSync=false.
- API srv-d63tmipr0fns73bsbcu0 autoDeploy=no.
- Worker srv-d64ftfogjchc739nejpg autoDeploy=no; it remains suspended.

Existing static frontend srv-d63tlvhr0fns73bsb560 retains its clarify.pm/www domains
and /* → /index.html rewrite solely for cached DNS and rollback. Its deployed
VITE_API_URL points to the Cloudflare provider URL and autoDeploy=no. Normal releases
use only scripts/deploy-cloudflare.sh; do not redeploy the Render fallback.
render.yaml describes only that free static service. Do not manually sync the old
Blueprint, resume the old paid worker/Redis, or recreate the absent database.

## Data, recovery and acceptance

SQLite migrations apply inside the object before requests execute. Raw content and
sourceMeta are stored together as ordered immutable UTF-8 pages. Capture pages,
metadata, job intent and wake scheduling commit atomically. Reprocess creates a new
generation; earlier in-flight AI results cannot commit over it. A finished extraction
commits its next organization step, so process loss cannot strand an extracted note.
Terminal processing failures remain visible and explicit reprocess retries them.

Before a release with data changes, preserve a Cloudflare SQLite Time Travel bookmark.
Use the provider's documented point-in-time recovery API/tooling; restore only after
identifying the exact namespace, object and bookmark, and preserving newer data.
A previous Worker version can roll back compatible code; the missing Render database
is not a valid application rollback. Never restore old data over new captures.

Native acceptance covers registration/login, private user projections, deduplicated
capture, oversized Unicode content/metadata, rollback on payload failure, extraction,
organization, review, reprocess, retries, hibernation, revocation and restart during AI.
Browser acceptance covers both desktop and phone in Chromium/WebKit on Linux.
Live acceptance must exercise real Sonnet extraction and organization, review and
reload persistence from the published app. Only then remove the homepage offline notice.

For the final DNS move, verify the copied Cloudflare records against a fresh Hostinger
export, change registrar nameservers to the assigned Cloudflare pair,
verify always_use_https=on, then bind clarify.pm, www and api.clarify.pm to this Worker.
Verify credential-free HTTP redirects on every hostname, TLS, SPA deep links,
authenticated API requests and browser live updates before retiring the static service.
The Worker configuration owns these domains and preserves www page redirects, paths
and queries. Disable Render frontend auto-deploy after acceptance, retaining its free
static fallback while prior DNS answers may be cached (original record TTL up to four
hours, parent NS TTL one hour). Do not delete it during that cache window.
