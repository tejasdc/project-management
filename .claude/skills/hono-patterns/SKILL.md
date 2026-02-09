---
name: hono-patterns
description: "Hono API patterns for the PM Agent project. Use when writing new routes, middleware, error handling, or RPC client code. Ensures consistency with existing patterns."
user_invocable: false
---

# Hono API Patterns

Reference guide for writing Hono code in this project. Follow these patterns to maintain consistency with the existing codebase.

## Route Structure

### Route files live in `packages/api/src/routes/`

Each route file creates a sub-Hono instance and exports it:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../types/env.js";

const app = new Hono<AppEnv>()
  .get("/", async (c) => {
    // handler
  })
  .post("/", zValidator("json", createSchema, (result) => {
    if (!result.success) throw result.error;
  }), async (c) => {
    const input = c.req.valid("json");
    // handler
  });

export default app;
```

### Route mounting in `packages/api/src/app.ts`

Routes are **chained** via `.route()` — this is critical for type inference:

```typescript
const withRoutes = withHealth
  .route("/api/auth", authRoutes)
  .route("/api/notes", noteRoutes)
  .route("/api/projects", projectRoutes)
  // ... more routes chained
  .get("/", (c) => c.json({ status: "ok" }));
```

**Why chaining matters:** The `AppType` export (`typeof app`) captures all route signatures. If routes are registered separately (not chained), the type system loses track and the Hono RPC client (`hc<AppType>`) on the frontend won't see them.

### AppType export for RPC client

```typescript
// packages/api/src/app.ts — bottom of file
export const app = createApp();
export type AppType = typeof app;
```

Used in the web client at `packages/web/src/lib/api-client.ts`:

```typescript
import { hc } from "hono/client";
import type { AppType } from "@pm/api";

const api = hc<AppType>(API_BASE_URL, {
  headers: () => {
    const k = getApiKey();
    return k ? { authorization: `Bearer ${k}` } : {};
  },
});
```

## Error Handling

### Use AppError helpers, never raw status codes

```typescript
import { badRequest, notFound, conflict, unauthorized } from "../lib/errors.js";

// CORRECT
throw notFound("Entity not found");
throw conflict("Email already registered");
throw badRequest("Missing required field");

// WRONG — bypasses global error handler formatting
return c.json({ error: "not found" }, 404);
```

Available helpers (see `packages/api/src/lib/errors.ts`):
- `badRequest(msg, details?)` — 400
- `unauthorized(msg?)` — 401
- `notFound(msg?)` — 404
- `conflict(msg?)` — 409
- `validationError(msg, details?)` — 422
- `rateLimited(msg?)` — 429
- `internalError(msg?)` — 500
- `serviceUnavailable(msg?)` — 503

### Global error handler

The `onError` handler in `app.ts` catches all errors and returns structured JSON:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Entity not found",
    "status": 404,
    "requestId": "req_abc123"
  }
}
```

Zod validation errors are automatically formatted with field-level details.

## Validation

### Always use zValidator with throw pattern

```typescript
.post("/", zValidator("json", mySchema, (result) => {
  if (!result.success) throw result.error;
}), async (c) => {
  const input = c.req.valid("json");
  // ...
})
```

Validator targets:
- `"json"` — request body (POST, PATCH, PUT)
- `"param"` — URL path parameters
- `"query"` — query string parameters

### Define schemas in the route file or a shared location

```typescript
const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});
```

## Middleware

### Auth middleware is applied globally after health check

```typescript
// packages/api/src/app.ts
const withHealth = base.get("/api/health", healthHandler);
const authed = withHealth.use("/api/*", authMiddleware);
```

Public routes (no auth): `/api/health`, `/api/auth/register`

### Route-level middleware

Apply rate limiters or other middleware per-route:

```typescript
const app = new Hono<AppEnv>()
  .use("/capture", tier2ApiKeyCaptureLimiter)
  .post("/capture", async (c) => { ... });
```

### Accessing auth context

```typescript
const user = c.get("user");     // { id, name, email }
const apiKey = c.get("apiKey"); // { id, userId, ... }
```

## SSE (Server-Sent Events)

Use Hono's `streamSSE()` helper with keepalive:

```typescript
import { streamSSE } from "hono/streaming";

app.get("/events", async (c) => {
  return streamSSE(c, async (stream) => {
    const keepalive = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" });
    }, 25_000);

    stream.onAbort(() => clearInterval(keepalive));

    // Send real events...
  });
});
```

## Checklist for New Routes

- [ ] Create route file in `packages/api/src/routes/`
- [ ] Use `new Hono<AppEnv>()` with proper typing
- [ ] Chain `.route()` in `app.ts` (don't register separately)
- [ ] Use `zValidator` for input validation
- [ ] Use `AppError` helpers for errors, not raw status codes
- [ ] Add route-level rate limiters if endpoint is externally facing
- [ ] Verify `AppType` still exports correctly (frontend RPC depends on it)
- [ ] No `/admin/`, `/debug/`, `/temp/`, or `/cleanup` paths (see CLAUDE.md)

## Context7 Documentation

For up-to-date Hono API reference, use Context7 MCP:
1. `resolve-library-id` with query "hono"
2. `query-docs` with the resolved ID and your specific question
