# Clarify.pm

Clarify.pm turns notes into tasks, decisions and insights, with source evidence and
human review. The canonical product address is https://clarify.pm/.

- [Agent instructions](../AGENTS.md): current runtime, ownership and checks.
- [Hosting](clarify-hosting.md): Cloudflare deployment, Render static fallback, DNS,
  credentials, live verification and recovery.
- [Migration design](plans/2026-09-11-cloudflare-free-tier.md): requirements and tradeoffs.
- [Product design](project-management-agent.md), [frontend views](frontend-views.md) and
  [extraction prompts](extraction-prompts.md): product semantics. Their old infrastructure
  examples are historical; AGENTS.md and the hosting runbook supersede them.
- [Database schema](database-schema.md) and [testing architecture](testing-architecture.md):
  original Postgres-era design references, superseded for runtime operations.

The owner explicitly authorized a fresh empty workspace/new login. SQLite Durable
Objects and alarms replace paid Postgres/Redis/worker services. Render Blueprint
auto-sync and old API/worker auto-deploys are disabled. The migration is published:
89 API tests, 12 native runtime tests and four local browser configurations passed.
Real AI capture, organization and review passed from clarify.pm, followed by live
login, saved-note and WebSocket checks in Chromium/WebKit at desktop/phone sizes.

clarify.pm, www.clarify.pm and api.clarify.pm now belong to the same Cloudflare Worker
and Workspace database. The browser uses same-origin API calls. Render's free static
frontend remains temporarily available for cached DNS, with automatic deploys disabled.
The old Render API, worker and Redis are suspended. Final domain acceptance includes
real AI organization/review and preserved source notes after the fresh-workspace fix.
The hosting runbook records deployment and acceptance evidence.
The personal-site entry remains controlled by .publish.json through ship-to-site.
The original prd.json is also a historical implementation checklist; it must not
restore retired infrastructure or override the current runtime instructions.
