---
name: render-debug
description: "Diagnose Clarify.pm production failures in a bounded subagent using the current hosting runbook."
user_invocable: true
---

Catalog: `pwa-that-doesnt-suck` covers stateful Cloudflare operation; this is the
repository delta for Clarify.pm's delegated production diagnostics. The legacy
command name remains compatible with existing references.

# Production diagnostics

Delegate the concrete issue to one bounded diagnostic agent. Supply the observed
failure and authoritative project root; ask it to read AGENTS.md and
docs/clarify-hosting.md before selecting a provider. The current app is the
clarify-pm Worker with one SQLite Workspace Durable Object, alarms and Anthropic.
Render is a free static DNS-cache fallback, not the API or job runtime.

Keep the initial diagnosis read-only. Record evidence and the smallest correction
in tmp/reviews/<issue>.md. The parent reads that artifact and owns changes, release
and acceptance. Ordinary delivering-agent HTTP/browser acceptance does not require
delegation; production log investigation does.

For capture failures, distinguish immutable note persistence, extraction, organization
and human review. Inspect only the named verification data or user-authorized note.
Use existing credentials in memory; never print keys, headers, raw unrelated notes or
SDK error bodies. Logs intentionally exclude private payloads. A generic stored error
does not prove an authentication, quota, schema or DNS cause.

Use the unified Cloudflare MCP or the canonical deployment token from
~/.config/cloudflare/deploy.env. If telemetry access is unavailable, state that limit
and prefer a bounded local reproduction with sanitized fixtures. Do not request broader
permissions solely to avoid a reproducible local diagnostic. Never add production
debug/admin endpoints, resume retired paid resources or mutate data during diagnosis.

Source: September 12, 2026 custom-domain acceptance exposed an organization failure;
the old Render-only diagnostic template contradicted the deployed Cloudflare runtime.
