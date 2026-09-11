# PM Agent — Project Instructions

## Tech Stack
- **API**: Hono + Drizzle + Postgres (packages/api)
- **Web**: Vite + React + TanStack Router/Query + shadcn/ui + Tailwind v4 (packages/web)
- **Shared**: Shared types and constants (packages/shared)
- **Worker**: BullMQ background jobs for AI extraction (packages/api/src/worker.ts)
- **Infra**: Render (pm-api, pm-web, pm-worker, pm-redis, pm-db)

## Public homepage

The product name is **Clarify.pm**, including the domain suffix in project headings,
wordmarks, and descriptions. Do not shorten it to "Clarify" (Tejas, 2026-09-11).

**Hosting decision (2026-09-11): keep the application and homepage on Render, using
`https://clarify.pm/`. The Cloudflare migration is canceled.** The portfolio must link
to that domain, never the temporary Pages URL.

`packages/web/src/components/Homepage.tsx` is the public homepage; its assets live in
`packages/web/public/homepage/`. Its example is illustrative and never calls the API.
The root route renders it outside AuthGate; every app route retains the existing gate
and providers. Render's existing `/*` → `/index.html` rewrite, build command, publish
directory, and package build filter are unchanged. Do not publish the repository root.

The Render credential is `~/.config/render/clarify.env` (mode 600). Existing service:
`srv-d63tlvhr0fns73bsb560`, with verified `clarify.pm`/`www.clarify.pm` domains. Deploy
only this frontend while the configured Postgres resource is unresolved and the
Redis/worker services are suspended. See `docs/clarify-hosting.md` for evidence,
deployment, and rollback. The homepage's offline notice stays until live app acceptance
passes. A Git push or frontend HTTP 200 does not prove backend health.

The existing Render Blueprint auto-syncs `render.yaml` and still declares the missing
database. Do not change or sync that Blueprint until database recovery/replacement is
decided: Render can recreate a deleted Blueprint resource. The homepage needs no
infrastructure configuration change. Preview with `corepack pnpm --filter @pm/web dev`.

## Worktree setup

`scripts/worktree-bootstrap.sh` runs `corepack pnpm install --frozen-lockfile`, then
builds `@pm/shared`. It copies no additional local files, starts no services, and sets
no ports or environment variables. The wt manager owns automatic ignored `.env*`
copying. A fresh worktree is ready when `corepack pnpm --filter @pm/web build` passes.

## Build & Test
```
pnpm --filter @pm/shared build          # Build shared first
pnpm --filter @pm/api build             # Build API
pnpm --filter @pm/web build             # Build web
pnpm --filter @pm/api test              # Run API tests
```

## Debugging Production Issues

**NEVER debug production issues in the main context window.** Always use the `/render-debug` skill or launch a `general-purpose` subagent with the render-debug prompt template.

Why: Production debugging involves fetching logs, checking deployments, and analyzing metrics — all of which consume significant context. The subagent runs in its own context window and returns only a crisp summary.

### How to debug:
1. Use `/render-debug` skill, OR
2. Launch a `general-purpose` Task agent with the issue description + architecture context from `.claude/skills/render-debug/SKILL.md`

### Architecture for debugging context:
```
Browser → pm-web (static) → pm-api (Hono) → pm-db (Postgres)
                                           → pm-redis (Valkey) → pm-worker (BullMQ) → Claude API
```

### Capture pipeline:
POST /api/notes/capture → raw_notes → [notes-extract job] → entities → [entities-organize job] → project/epic assignment

## Key Patterns
- Queue names use hyphens, not colons: `notes-extract`, `entities-organize`, `notes-reprocess`
- AI extraction uses Zod v4 native `z.toJSONSchema()` (NOT zod-to-json-schema library — it's incompatible with Zod v4)
- Review queue inserts need `.onConflictDoNothing()` for retry safety
- Auth is API key-based (Bearer token). Public paths: `/api/health`, `/api/auth/register`
- Redis is optional for the API server (degrades gracefully) but required for the worker
- Drizzle v0.45 wraps Postgres errors: check `err.cause.code` not `err.code` for unique violations
- TanStack Router: `foo.tsx` = layout, `foo.index.tsx` = index, `foo.$param.tsx` = dynamic. Don't confuse layout with index.
- Node 22+ required (see `.nvmrc`). Node <18 crashes on modern JS syntax.

## Deployment Safety

**NEVER deploy temporary endpoints, debug routes, or admin cleanup code to production.** This exact mistake happened before — a `POST /api/admin/clean-test-data` endpoint was pushed to main, requiring two unnecessary deploys to add and revert. Use `/prod-data-reset` for data operations instead.

When writing route handlers in `packages/api/src/routes/`:
- No `/admin/`, `/debug/`, `/temp/`, or `/cleanup` route paths
- No hardcoded auth tokens (`c.req.query("token")`) — use the auth middleware
- No destructive SQL (`TRUNCATE`, `DROP`) in route handlers — use `/prod-data-reset` skill
- If you need a one-off data operation, STOP and use `/prod-data-reset` instead of writing code

Before deploying, run `/pre-deploy` to check for:
- Temp/admin/debug routes in `packages/api/src/routes/`
- Hardcoded secrets or tokens in source files
- Queue names with colons (BullMQ breaks)
- Review queue inserts missing `.onConflictDoNothing()`
- `zod-to-json-schema` imports (incompatible with Zod v4)

## Quality Gates

Before committing or creating PRs:
1. Run `/run-tests` — builds shared, typechecks all packages, runs API tests, builds web
2. Run `/spec-check` — detects drift between code and design docs (launches a subagent)
3. Run `/verify-frontend` — checks route naming, component completeness, visual match
4. Run `/pre-deploy` — scans for dangerous patterns before pushing

## Library Rules (Hard-Won Lessons)

| Library | Rule | Why |
|---------|------|-----|
| Zod v4 | Use `z.toJSONSchema()`, never `zod-to-json-schema` | v3 produces empty schemas silently |
| BullMQ | Queue names use hyphens, never colons | Colons break Redis key structure |
| Drizzle v0.45 | Check `err.cause.code` for PG errors, never `err.code` directly | Drizzle wraps errors in `DrizzleQueryError` |
| Testcontainers | `fileParallelism: false` in vitest config | Tests share container |
| Redis/Valkey | Set `maxmemory-policy noeviction` | Prevents job data eviction |

## Drizzle Error Handling

Drizzle v0.45 wraps Postgres errors in `DrizzleQueryError`. **Never check `err.code` directly** — it won't match. Always check `err.cause.code`:

```typescript
// WRONG — err.code is undefined in Drizzle v0.45+
if (err.code === '23505') { ... }

// CORRECT — the PG error is on err.cause
if (err.cause?.code === '23505') { ... }
```

Use the `isUniqueViolation()` helper from `packages/api/src/services/capture.ts` which checks both layers. When writing new catch blocks for Postgres errors, always follow this pattern.

## Stack Pattern Skills

When writing code for the core stack, consult these skills for project-specific patterns:

| Domain | Skill | When to use |
|--------|-------|-------------|
| API routes | `hono-patterns` | New routes, middleware, error handling, RPC client |
| Database | `drizzle-patterns` | Schemas, queries, transactions, migrations, error handling |
| Job queues | `bullmq-patterns` | New queues, workers, processors, retry config |

These skills contain real examples from this codebase, not generic docs. For up-to-date library API reference, use Context7 MCP (`resolve-library-id` → `query-docs`).
