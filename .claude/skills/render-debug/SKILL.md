---
name: render-debug
description: "Debug production issues on Render. Launches a subagent that checks service health, reads logs, analyzes errors, and returns a diagnostic summary — all without consuming the main context window. Use when something isn't working in production."
user_invocable: true
---

# Render Production Debugger

When this skill is invoked, launch a `general-purpose` subagent via the Task tool with the prompt below. The subagent runs in its own context window and returns a crisp summary.

## How to Use

1. Take the user's issue description (or default to "general health check")
2. Launch a `general-purpose` subagent with the **Debug Agent Prompt** below, inserting the user's issue
3. When the subagent returns, relay its findings to the user

## Debug Agent Prompt

Copy this entire prompt into the Task tool, replacing `{{ISSUE}}` with the user's description:

---

You are debugging a production issue on Render for the PM Agent application.

**Issue to investigate**: {{ISSUE}}

## System Architecture

```
[Browser] → pm-web (static site, Vite/React)
    ↓
[API Calls] → pm-api (Hono, Node.js)
    ↓                    ↓
pm-db (PostgreSQL)    pm-redis (Valkey/Redis)
                         ↓
                    pm-worker (BullMQ, Node.js)
                         ↓
                    Claude API (extraction + organization)
                         ↓
                    pm-db (writes entities)
```

### Capture Pipeline
1. `POST /api/notes/capture` → saves raw note to `raw_notes` table
2. Enqueues `notes-extract` job via BullMQ/Redis
3. Worker picks up job, calls Claude API to extract entities
4. Entities saved to DB, enqueues `entities-organize` job
5. Worker assigns project/epic via Claude API
6. SSE events published for real-time UI updates

### Queue Names: `notes-extract`, `entities-organize`, `notes-reprocess`

### Common Failures
- Redis connection errors → jobs not processed
- Claude API 400 errors → bad tool schema
- Missing ANTHROPIC_API_KEY → all extraction fails
- SSE reconnection storm → rapid GET /api/sse in logs

## Investigation Steps

**IMPORTANT: Use ToolSearch to load Render MCP tools before calling them.**

1. `ToolSearch("render list services")` → load mcp__render__list_services → get service IDs
2. `ToolSearch("render list logs")` → load mcp__render__list_logs
3. Check pm-worker logs: `{ resource: [workerServiceId], type: ["app"], level: ["error", "warn"], limit: 50, direction: "backward" }`
4. Check pm-api logs: `{ resource: [apiServiceId], type: ["app"], level: ["error", "warn"], limit: 50, direction: "backward" }`
5. Check recent deploys: `ToolSearch("render list deploys")` → `mcp__render__list_deploys({ serviceId, limit: 3 })`
6. If needed, check metrics: `ToolSearch("render get metrics")` → CPU/memory/latency

## Output Format

Return findings in this format:

```
## Render Debug Report

**Issue**: [what was investigated]
**Status**: 🟢 Healthy | 🟡 Degraded | 🔴 Down

### Services
| Service | Status | Notes |
|---------|--------|-------|
| pm-api | 🟢/🟡/🔴 | ... |
| pm-worker | 🟢/🟡/🔴 | ... |

### Root Cause
[What's wrong, with log evidence]

### Key Logs
[2-3 most relevant log lines]

### Recommendation
[Specific fix actions]
```

Be concise. Only return actionable information.

---
