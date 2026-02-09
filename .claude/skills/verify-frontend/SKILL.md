---
name: verify-frontend
description: "Verify frontend routes, component completeness, and visual match against mockups. Use after making frontend changes, before PRs, or when asked to check the UI. Catches TanStack Router naming issues and missing UI features."
user_invocable: true
---

# Verify Frontend

Check frontend implementation for route naming, component completeness, and visual match.

## When to Use

- After creating or renaming route files in `packages/web/src/routes/`
- After implementing a new page or component
- Before creating a PR that touches frontend code
- When asked to "check the frontend" or "verify the UI"

## Checks

### 1. TanStack Router File Naming

**This has caused bugs before.** TanStack Router uses file-based routing conventions:

| Pattern | Meaning | Example |
|---------|---------|---------|
| `foo.tsx` | Layout route for `/foo` | `projects.tsx` wraps all `/projects/*` |
| `foo.index.tsx` | Index route for `/foo` | `projects.index.tsx` renders at `/projects` |
| `foo.$param.tsx` | Dynamic param route | `projects.$projectId.tsx` renders at `/projects/:id` |
| `_foo.tsx` | Pathless layout (no URL segment) | `_authenticated.tsx` wraps auth-required routes |

**Common mistake**: Creating `projects.tsx` when you mean `projects.index.tsx`. The former is a LAYOUT route (renders `<Outlet />`), the latter is the INDEX route (renders at `/projects`).

Verify:
```bash
ls packages/web/src/routes/
```

Check that:
- Every route with children has a `.index.tsx` sibling
- No orphaned layout routes exist without corresponding index routes
- Dynamic param routes use `$paramName` not `:paramName`

### 2. Component Completeness

For each page/route component, verify it includes:

- [ ] Error boundary or `errorComponent` on the route
- [ ] Loading state (skeleton or spinner) via `pendingComponent` or TanStack Query `isLoading`
- [ ] Empty state (when data list is empty)
- [ ] Proper TypeScript types (no `as any` casts on API responses)

For interactive components, verify:
- [ ] Status dropdowns use `<select>` or shadcn `Select`, not raw text
- [ ] Forms have validation feedback
- [ ] Mutations show loading state and error toasts
- [ ] Links use TanStack Router `<Link>` not `<a href>`

### 3. Visual Verification Against Mockups

If mockups exist in `mockups/`, use the browser automation tools to compare:

1. Start the dev server: `pnpm --filter @pm/web dev`
2. Open each page in Chrome using `mcp__claude-in-chrome__*` tools
3. Take screenshots using `mcp__claude-in-chrome__computer`
4. Compare against the corresponding mockup HTML file
5. Note differences in layout, colors, spacing, typography

Mockup files to check:
- `mockups/review-queue.html` → `/review`
- `mockups/projects-dashboard.html` → `/projects`
- `mockups/project-view.html` → `/projects/:id`
- `mockups/entity-detail.html` → `/entities/:id`

### 4. Hono RPC Type Safety

Check that `packages/web/src/lib/api-client.ts` uses properly typed Hono RPC:
- `AppType` should be imported from `@pm/api` (not `any`)
- No `as any` casts on `hc<AppType>()`
- Query hooks should infer types from the RPC client

## Report

| Check | Status | Notes |
|-------|--------|-------|
| Route naming | PASS/FAIL | List any naming issues |
| Component completeness | PASS/FAIL | List missing states |
| Visual match | PASS/FAIL/SKIP | List differences |
| Type safety | PASS/FAIL | List any `as any` casts |
