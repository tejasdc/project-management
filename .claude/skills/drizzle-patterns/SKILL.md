---
name: drizzle-patterns
description: Clarify.pm SQLite schema, queries, migrations and transactions.
---
Catalog: `stateful-shapes` covers ownership; this delta names Drizzle SQLite conventions.

Schemas are in packages/api/src/db/schema. Migrations are in packages/api/drizzle-sqlite.
Use `corepack pnpm --filter @pm/api db:generate`; generated migration JS/SQL must ship
together. Historical packages/api/drizzle Postgres SQL is not an executable target.

The workspace owns the database; db/index.ts resolves it through the request's
AsyncLocalStorage runtime. Never add a process-global connection. Use synchronous
Drizzle transactions: relational .sync(), result .all()/.get(), writes .run().
Do not place external awaits inside these transactions.

Capture/reprocess use runtime.mutateAndWake so SQL intent and the alarm share a
Cloudflare storage transaction. AI calls remain outside transactions; state.ts checks
generation ownership before commit. Partial review uniqueness and foreign keys matter.

Use explicit enum checks and on-update timestamps. Immutable raw note bodies and
sourceMeta live in ordered UTF-8 pages and must be hydrated at the API boundary.
ID-set filters use json_each with one serialized array. Users/tags and project-name
deduplication use JavaScript Unicode case folding; SQLite lower() is ASCII-only.
Use onConflictDoNothing for expected uniqueness races rather than Postgres error codes.
Source: verified SQLite/native runtime tests in the September 2026 migration.
