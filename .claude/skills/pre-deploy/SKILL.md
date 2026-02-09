---
name: pre-deploy
description: "Pre-deployment checklist before pushing to main or deploying to Render. Scans for dangerous patterns, runs full build+tests, validates render.yaml, and checks git status. Use before any production deployment."
user_invocable: true
---

# Pre-Deploy Checklist

Run this before pushing to main or deploying to Render. Catches dangerous patterns that have caused production issues before.

## Anti-Patterns This Skill Prevents

| Pattern | What happened | How we detect it |
|---------|--------------|-----------------|
| Temp admin endpoints | Deployed `POST /api/admin/clean-test-data` to prod | Grep for `/admin/`, `/debug/`, `/temp/` routes |
| Hardcoded secrets | API keys/tokens in source code | Grep for `pm_live_`, `pm_test_`, hardcoded Bearer tokens |
| Wrong Node version | TypeScript crashed on Node v12 | Check `.nvmrc` matches Render config |
| Broken shared build | API/web fail because shared wasn't built | Build shared first, then dependents |
| Missing onConflictDoNothing | BullMQ retries create duplicate review items | Grep review_queue inserts for conflict handling |
| Colons in queue names | BullMQ silently fails with colon-separated names | Grep for queue names with `:` |

## Checklist

### Step 1: Scan for dangerous patterns

Run these greps and flag any matches:

```bash
# Temp/admin/debug routes (should not exist in production code)
grep -rn "admin\|/debug\|/temp\|/cleanup" packages/api/src/routes/ --include="*.ts"

# Hardcoded secrets or tokens
grep -rn "pm_live_\|pm_test_\|Bearer.*[a-zA-Z0-9_]{20}" packages/ --include="*.ts" | grep -v "node_modules\|\.test\.\|tests/"

# Queue names with colons (BullMQ breaks)
grep -rn "new Queue\|new Worker" packages/api/src/ --include="*.ts" | grep ":"

# Review queue inserts missing conflict handling
grep -rn "review_queue" packages/api/src/ --include="*.ts" | grep "insert\|\.values" | grep -v "onConflict"

# zod-to-json-schema imports (incompatible with Zod v4)
grep -rn "zod-to-json-schema\|zodToJsonSchema" packages/ --include="*.ts" | grep -v "node_modules"
```

If ANY of these return matches, STOP and review with the user before proceeding.

### Step 2: Full build pipeline

Run `/run-tests` skill (or manually):

```bash
pnpm --filter @pm/shared build
pnpm --filter @pm/api exec tsc --noEmit
pnpm --filter @pm/web exec tsc --noEmit
pnpm --filter @pm/api test
pnpm --filter @pm/web build
```

All must pass before deploying.

### Step 3: Validate render.yaml

```bash
# Check render.yaml exists and references correct services
cat render.yaml
```

Verify:
- [ ] All service names match Render dashboard (pm-api, pm-web, pm-worker, pm-redis, pm-db)
- [ ] Build commands include `pnpm --filter @pm/shared build` before dependent builds
- [ ] Node version in `engines` or env vars matches `.nvmrc` (22+)
- [ ] No `fromService` references to non-existent services
- [ ] Environment variables reference correct service names

### Step 4: Git status check

```bash
git status
git diff --stat main...HEAD
```

Verify:
- [ ] No untracked `.env` files or credentials
- [ ] No temporary/debug files being committed
- [ ] All changes are intentional and related to the PR

### Step 5: Migration safety (if applicable)

If there are new migrations in `packages/api/drizzle/`:

- [ ] Migration is additive (no DROP COLUMN/TABLE without discussion)
- [ ] New columns have defaults or are nullable
- [ ] Indexes are created CONCURRENTLY if on large tables
- [ ] Triggers/functions are idempotent (CREATE OR REPLACE)

## Report

| Check | Status | Findings |
|-------|--------|----------|
| Dangerous patterns | PASS/FAIL | List any matches |
| Build pipeline | PASS/FAIL | List failures |
| render.yaml | PASS/FAIL | List issues |
| Git status | PASS/FAIL | List concerns |
| Migration safety | PASS/FAIL/N/A | List issues |

## Decision

- All PASS → Safe to deploy
- Any FAIL → Fix before deploying, discuss with user
