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
The cutover deployment was 82419030-d821-4114-8496-2b13d3b6924c, source 7d75e4f.
The final runtime release is 49fba64e-e27b-47fa-89c8-c776e76aa546, source da55ed5.
All three hostnames share the unchanged Workspace namespace and object.
The frontend uses same-origin /api and wss://clarify.pm/api/live.

Credential-free public probes passed valid TLS, HTTP-to-HTTPS redirects on every
hostname, www canonical redirects preserving paths and queries, SPA deep links,
database health and anonymous API rejection. GitHub CI passed the release commit;
local gates passed 89 API tests, 12 native tests, typechecks and the web build.
Cloudflare is the only deployment and recovery target. The September 13 owner
instruction requires deletion of all Clarify.pm Render resources and supersedes
the earlier temporary fallback arrangement.

On September 13, 2026, Render returned HTTP 204 for deletion and then HTTP 404 for
each of these exact project resources:
- Blueprint exs-d63thkkr85hc73bfn9i0.
- Static frontend pm-web, srv-d63tlvhr0fns73bsb560.
- API pm-api, srv-d63tmipr0fns73bsbcu0.
- Background worker pm-worker, srv-d64ftfogjchc739nejpg.
- Redis pm-redis, red-d64fsbf5r7bs73af5u4g.

The old Postgres resource dpg-d63tlvpr0fns73bsb5ag-a was already absent. There are
no suspended Clarify.pm services to maintain or resume. The complete owner-filtered
inventory identified other projects separately; only these Clarify.pm resources
were deleted. The Cloudflare runtime and its database were not changed by removal.
After deletion, complete service, Blueprint, Redis and Postgres lists confirmed no
Clarify.pm resources remained. A live Chromium check at 1440×1000 passed homepage,
login, same-origin API calls, live updates through both API domains, preserved raw
notes and AI/review results, and logout. Anonymous API requests still returned 401;
HTTPS and www redirects passed. Verification-account keys were revoked afterward.

Final same-origin browser acceptance passed Chromium and WebKit on Linux at
1440×1000 and 390×844: sign-in, live updates from both API hostnames, raw-note
persistence and logout. A fresh real-AI capture exposed an epic suggestion referencing
a nonexistent project; exact-response replay reproduced the foreign-key failure.
The reviewed fix discards epic suggestions outside the active-project context and
keeps valid project creation and review intact. The saved note then passed real
reprocessing, organization, review persistence across both domain API entrances and
source preservation. A post-fix Chromium check confirmed the error notice cleared.
The deployed runtime commit passed GitHub CI. Verification account keys are revoked.

New registrations require the workspace invitation code. Each invited account sees
the same workspace. The code is a Worker secret, never a frontend environment value.
The owner creates their own account; migration acceptance accounts are clearly
identified and their API keys are revoked after testing.

## Deploy

Use the canonical token/environment in ~/.config/cloudflare/deploy.env. Build shared
and web, pass the API/native/browser checks, then run scripts/deploy-cloudflare.sh.
Worker secrets are ANTHROPIC_API_KEY and REGISTRATION_CODE; never commit them or use
Wrangler OAuth. All runtime data belongs to this Worker's own Workspace namespace.

Use only scripts/deploy-cloudflare.sh. The old Render deployment file and Postgres
reset tooling have been removed. Production diagnostics use production-debug and
the current Cloudflare runtime. Historical designs do not authorize recreating any
Render resource.

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

The Worker configuration owns clarify.pm, www.clarify.pm and api.clarify.pm and
preserves www page redirects, paths and queries. Verify HTTPS, authenticated API
requests, source persistence and live browser behavior after infrastructure changes.
Do not add a second hosting provider for fallback or rollback.
