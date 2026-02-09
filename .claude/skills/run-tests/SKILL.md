---
name: run-tests
description: "Build, typecheck, and test the PM Agent monorepo. Use before committing, before creating PRs, or whenever asked to verify the build. Catches type errors, broken imports, and test regressions."
user_invocable: true
---

# Run Tests

Full build + typecheck + test pipeline for the PM Agent monorepo.

## When to Use

- Before committing or creating a PR
- After making changes across multiple packages
- When asked to "run tests", "verify the build", or "check if it works"
- After resolving merge conflicts

## Pipeline

Run these steps sequentially — each depends on the previous:

### Step 1: Build shared package

```bash
pnpm --filter @pm/shared build
```

Shared must build first since api and web depend on it.

### Step 2: Typecheck all packages

Run in parallel:

```bash
pnpm --filter @pm/api exec tsc --noEmit
pnpm --filter @pm/web exec tsc --noEmit
pnpm --filter @pm/shared exec tsc --noEmit
```

If any typecheck fails, STOP and fix before proceeding.

### Step 3: Run API tests

```bash
pnpm --filter @pm/api test
```

Tests use testcontainers (Docker required). Key config:
- `fileParallelism: false` in vitest.config.ts (shared testcontainer)
- Redis is mocked via `vi.mock` in test setup
- DB is truncated between tests, not rolled back

### Step 4: Build web package

```bash
pnpm --filter @pm/web build
```

Catches Vite build errors, CSS issues, and missing imports.

## Report Results

After all steps, summarize in a table:

| Step | Status | Notes |
|------|--------|-------|
| Shared build | PASS/FAIL | ... |
| API typecheck | PASS/FAIL | ... |
| Web typecheck | PASS/FAIL | ... |
| Shared typecheck | PASS/FAIL | ... |
| API tests | PASS/FAIL | X passed, Y failed |
| Web build | PASS/FAIL | ... |

## Known Gotchas

- **Node version**: Must be Node 22+ (check `.nvmrc`). Node <18 will crash on modern JS syntax.
- **Zod v4**: Never import from `zod-to-json-schema` — use `z.toJSONSchema()` natively.
- **Drizzle errors**: Check `err.cause.code` not `err.code` for Postgres error codes (Drizzle v0.45 wraps errors).
- **Test open handles**: Tests may hang if SSE keepalive or rate limiter intervals aren't cleaned up. Check `afterAll` hooks.
