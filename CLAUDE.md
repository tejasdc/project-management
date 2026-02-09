# PM Agent — Project Instructions

## Tech Stack
- **API**: Hono + Drizzle + Postgres (packages/api)
- **Web**: Vite + React + TanStack Router/Query + shadcn/ui + Tailwind v4 (packages/web)
- **Shared**: Shared types and constants (packages/shared)
- **Worker**: BullMQ background jobs for AI extraction (packages/api/src/worker.ts)
- **Infra**: Render (pm-api, pm-web, pm-worker, pm-redis, pm-db)

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
