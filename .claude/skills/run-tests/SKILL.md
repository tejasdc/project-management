---
name: run-tests
description: Build, typecheck and test Clarify.pm before release.
---
Catalog: `local-test` covers test design; this delta names Clarify.pm's commands.

Build shared first: `corepack pnpm --filter @pm/shared build`.
Then `corepack pnpm -r run typecheck`, `corepack pnpm --filter @pm/api test`,
`corepack pnpm --filter @pm/web build`, and `node scripts/test-worker.mjs`.

The API suite uses isolated in-memory SQLite per file, with native parallel execution.
The native suite bundles the actual Worker and exercises Cloudflare SQLite, alarms,
hibernating sockets, oversized payloads, retries, rollback and generation ownership.
It uses local AI fixtures, not the live Anthropic account. No Docker/Redis is required.

During repairs run only the affected tests; perform the integrated gates after the
whole change. Report exact results and distinguish local runtime from live acceptance.
Source: September 2026 Cloudflare migration; AGENTS.md and CI are current authority.
