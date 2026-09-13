---
name: hono-patterns
description: Clarify.pm Hono API routes and authentication on Cloudflare.
---
Catalog: `pwa-that-doesnt-suck` covers Cloudflare lifecycle; this is the route delta.

createApp in packages/api/src/app.ts owns typed route composition; the frontend uses
its AppType through Hono hc. Add Zod validators and AppEnv context types to routes.
Errors use lib/errors.ts. Request logs include paths and operational metadata only.

The API runs inside the Workspace Durable Object. Use the runtime database accessor;
there is no Node HTTP server or Postgres pool. CORS must permit the canonical frontend
and Worker origins. The production browser uses same-origin Cloudflare API requests.

Public paths: /api/health, /api/auth/register, /api/auth/login. Registration still
requires the workspace invitation secret. API keys authenticate every other route.
Always use safe user projections; hashes must never reach public responses.

Live updates use /api/live and authenticated WebSocket protocol headers. The Worker
accepts sockets through the hibernation API and checks key revocation. Do not restore
/api/sse, bearer query parameters, EventSource or recurring keepalive timers.
Source: September 2026 migration; native auth/CORS/socket acceptance tests.
