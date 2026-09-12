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
No paid plan or subscription was enabled by this migration. Static assets bypass
Worker execution. Idle WebSockets hibernate, and idle job processing has no timer.
Anthropic inference remains separately charged through the existing key. R2 is not
used: its included allowance would not provide a hard zero-charge storage limit.

The existing extraction model was retired; the compatible supported default is
claude-sonnet-4-6. Existing prompts, tool schemas, evidence and review behavior remain.

## URLs and access

- Product: https://clarify.pm/
- Cloudflare app/API: https://clarify-pm.thnkring.workers.dev/
- Old API hostname: https://api.clarify.pm/ still needs DNS control.

The domain currently delegates to ns1/ns2.dns-parking.com and is absent from the
available Cloudflare zone list. Until DNS access is restored, the existing Render
static frontend serves the product URL with its VITE_API_URL rebuilt to point at
Cloudflare. That static service adds no fixed backend hosting fee. It is mixed
hosting; do not claim a completed all-Cloudflare domain migration.

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

Existing static frontend srv-d63tlvhr0fns73bsb560 retains its verified clarify.pm/www
domains and /* → /index.html rewrite. Set VITE_API_URL to the Cloudflare URL, rebuild,
deploy the reviewed main commit and verify the actual canonical browser flow.
render.yaml now contains only that static frontend. Do not manually sync the old
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

For the final DNS move, obtain the existing complete zone, add clarify.pm to the same
Cloudflare account, preserve unrelated MX/TXT records, change registrar nameservers,
then bind clarify.pm, www and api.clarify.pm to this Worker. Verify TLS, SPA deep links,
authenticated API requests and browser live updates before retiring the static service.
