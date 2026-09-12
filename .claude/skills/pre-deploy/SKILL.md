---
name: pre-deploy
description: Verify Clarify.pm deployment safety and required gates.
---
Catalog: `pwa-that-doesnt-suck` covers stateful Cloudflare deployment; this is the repo delta.

Read AGENTS.md and docs/clarify-hosting.md. Run run-tests and browser verification.
Scan the complete packages tree for temporary admin/debug/cleanup routes, hardcoded
credentials, query-string bearer keys, unsafe logs and zod-to-json-schema imports.
Inspect matches in context: key-generation prefixes and test fixtures are expected.
Resolve actual unsafe patterns before release; do not treat every text match as a
new permission gate.

Check wrangler.jsonc provisions this project's own SQLite Workspace namespace and
routes only dynamic paths through the Worker. render.yaml must contain only the
existing free static frontend. Never recreate pm-db or resume paid Redis/worker
resources. Blueprint auto-sync and old API/worker auto-deploy are disabled.

Review the actual whole diff under the global risk rules. Deploy using the canonical
Cloudflare token, then verify login, real capture/extraction/organization/review,
live updates and persistence from the actual published frontend. Verify the old
api.clarify.pm hostname separately; missing DNS access is not a successful cutover.
Source: September 2026 migration and independently verified Render control changes.
