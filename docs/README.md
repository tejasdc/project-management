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
auto-sync and old API/worker auto-deploys are disabled. Local API and native runtime
verification are passing; publication and live acceptance are still underway.

Until registrar/DNS access is available, the existing free Render static frontend
can preserve clarify.pm using the Cloudflare API. api.clarify.pm remains separate
DNS compatibility work. Do not change the portfolio to a temporary URL.
The personal-site entry remains controlled by .publish.json through ship-to-site.
