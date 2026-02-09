---
name: prod-data-reset
description: "Safely reset production data on Render without deploying temporary code. This skill should be used when the user asks to clean up test data, reset the production database, truncate tables, or wipe data from the PM Agent app. It connects directly to the database via psql — no temporary API endpoints, no extra deploys."
user_invocable: true
---

# Production Data Reset

Reset production data safely using a direct database connection. Never deploy temporary cleanup code to production.

## Anti-Patterns This Skill Prevents

Previous cleanup attempt made these mistakes — this skill exists to prevent them:

| Mistake | What happened | Correct approach |
|---------|--------------|-----------------|
| Temporary endpoint deployed to prod | Added `POST /api/admin/clean-test-data` to app.ts, pushed to main | Use direct `psql` connection via DATABASE_URL |
| Two unnecessary deploys | Deploy temp code → use it → revert → deploy again | Zero deploys needed; run script locally |
| Weak auth on destructive endpoint | Hardcoded query param `?token=clean-prod-2026-02-09` | No endpoint = no auth surface |
| Temp code committed to main | Git history permanently contains the cleanup endpoint | Nothing to commit; script lives outside app code |
| No dry-run | Truncated immediately without previewing row counts | Always dry-run first (default mode) |
| No backup | Data destroyed without export | Always `pg_dump --data-only` before truncating |

## Workflow

### Step 1: Get the Database Connection URL

Use Render MCP tools to retrieve the DATABASE_URL:

```
ToolSearch("+render postgres") → load mcp__render__list_postgres_instances
mcp__render__list_postgres_instances() → get the pm-db instance ID
mcp__render__get_postgres({ postgresId }) → get the connection string (externalConnectionString or connectionString)
```

If Render MCP is unavailable, ask the user for the DATABASE_URL from the Render dashboard (Dashboard → pm-db → Info → External Database URL).

### Step 2: Dry-Run (Always First)

Run the bundled script in dry-run mode to see current row counts:

```bash
.claude/skills/prod-data-reset/scripts/reset-prod-data.sh "$DATABASE_URL"
```

This shows row counts for all tables and changes nothing. Review the output with the user before proceeding.

### Step 3: Backup + Reset

After user confirms the dry-run output, run with backup:

```bash
.claude/skills/prod-data-reset/scripts/reset-prod-data.sh "$DATABASE_URL" --backup backups/pm-backup-$(date +%Y%m%d-%H%M%S).sql
```

This will:
1. Show row counts (same as dry-run)
2. Export all data tables to a pg_dump file
3. Prompt for confirmation (`Type 'yes' to confirm`)
4. Truncate tables in FK-safe order (leaf tables first)
5. Verify all data tables are empty, users/api_keys preserved

### Step 4: Verify

After reset, verify via Render MCP read-only query:

```
ToolSearch("+render query postgres") → load mcp__render__query_render_postgres
mcp__render__query_render_postgres({
  postgresId: "<pm-db-id>",
  sql: "SELECT 'projects' as t, count(*) FROM projects UNION ALL SELECT 'entities', count(*) FROM entities UNION ALL SELECT 'raw_notes', count(*) FROM raw_notes UNION ALL SELECT 'users', count(*) FROM users"
})
```

## Table Truncation Order

Tables are truncated leaf-first to respect FK constraints (see `references/schema-tables.md` for full details):

```
review_queue → entity_events → entity_sources → entity_relationships →
entity_tags → entities → epics → raw_notes → tags → projects
```

**Never truncated**: `users`, `api_keys`

## Important Rules

- **NEVER add temporary endpoints** to application code for data operations
- **NEVER commit cleanup code** to the repository
- **ALWAYS dry-run first** — show the user row counts before any destructive action
- **ALWAYS backup** unless the user explicitly says to skip it
- **ALWAYS verify** after reset using a read-only query
- If `psql` is not available locally, use `brew install postgresql` or the Render dashboard's shell
