---
name: drizzle-patterns
description: "Drizzle ORM patterns for the PM Agent project. Use when writing schemas, queries, transactions, migrations, or error handling against Postgres. Ensures consistency and avoids known pitfalls."
user_invocable: false
---

# Drizzle ORM Patterns

Reference guide for writing Drizzle code in this project. Follow these patterns to maintain consistency and avoid known pitfalls.

## Schema Definitions

### Tables live in `packages/api/src/db/schema/`

Each table gets its own file. Use `pgTable` with the index/constraint callback:

```typescript
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const myTable = pgTable("my_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("my_table_name_idx").on(t.name),
]);
```

### Enums are centralized in `packages/api/src/db/schema/enums.ts`

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const myStatusEnum = pgEnum("my_status", ["active", "archived"]);
```

### Relations go in `packages/api/src/db/schema/relations.ts`

Keep relation definitions separate from table definitions:

```typescript
import { relations } from "drizzle-orm";

export const projectsRelations = relations(projects, ({ many }) => ({
  epics: many(epics),
  entities: many(entities),
}));

export const epicsRelations = relations(epics, ({ one, many }) => ({
  project: one(projects, { fields: [epics.projectId], references: [projects.id] }),
  entities: many(entities),
}));
```

### Foreign keys use explicit cascade rules

```typescript
projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
epicId: uuid("epic_id").references(() => epics.id, { onDelete: "cascade" }),
```

Conventions:
- Parent owns children (epics under project): `onDelete: "cascade"`
- Optional references (entity → project): `onDelete: "set null"`
- Self-referential (subtasks): `onDelete: "set null"`

### JSONB columns are typed

```typescript
import type { EntityAttributes } from "@pm/shared";

attributes: jsonb("attributes").$type<EntityAttributes>(),
```

## Query Patterns

### Simple lookup — use `db.query` API

```typescript
const entity = await db.query.entities.findFirst({
  where: (t, { eq }) => eq(t.id, entityId),
});
```

### List with filtering — use select builder

```typescript
const conditions = [eq(entities.type, "task")];
if (projectId) conditions.push(eq(entities.projectId, projectId));
if (status) conditions.push(eq(entities.status, status));

const rows = await db
  .select()
  .from(entities)
  .where(and(...conditions))
  .orderBy(desc(entities.createdAt), desc(entities.id))
  .limit(limit + 1); // +1 for cursor pagination
```

### Joins

```typescript
// Inner join for filtering through join table
const rows = await db
  .select({ entity: entities })
  .from(entities)
  .innerJoin(entityTags, eq(entityTags.entityId, entities.id))
  .where(eq(entityTags.tagId, tagId));

// Multi-table join for lookups
const tagMap = await db
  .select({ entityId: entityTags.entityId, tagName: tags.name })
  .from(entityTags)
  .innerJoin(tags, eq(tags.id, entityTags.tagId))
  .where(inArray(entityTags.entityId, entityIds));
```

### Insert with returning

```typescript
const [entity] = await db.insert(entities).values(input).returning();
```

### Update with where

```typescript
const [updated] = await db
  .update(entities)
  .set({ ...patch, updatedAt: new Date() })
  .where(eq(entities.id, id))
  .returning();
```

### Delete with where

```typescript
await db.delete(entityTags).where(eq(entityTags.entityId, id));
```

## Transactions

### Use `db.transaction()` for multi-statement operations

```typescript
return db.transaction(async (tx) => {
  const [entity] = await tx.update(entities).set({ status }).where(eq(entities.id, id)).returning();
  await tx.insert(entityEvents).values({ entityId: id, eventType: "status_change", ... });
  return entity!;
});
```

### Use `tx` (not `db`) inside transactions

Every query inside the callback must use the `tx` parameter, not the global `db`. Using `db` inside a transaction will execute outside the transaction boundary.

## Conflict Handling

### Always use `.onConflictDoNothing()` for idempotent inserts

This is critical for BullMQ retry safety — jobs may run more than once:

```typescript
// Tags — unique name constraint
await tx.insert(tags).values({ name: tagName }).onConflictDoNothing();

// Join tables — composite primary key
await tx.insert(entityTags)
  .values(tagIds.map(tagId => ({ entityId, tagId })))
  .onConflictDoNothing();

// Review queue — partial unique index on (entityId, reviewType) WHERE status = 'pending'
await tx.insert(reviewQueue)
  .values({ entityId, reviewType: "type_classification", ... })
  .onConflictDoNothing();
```

### When NOT to use onConflictDoNothing

- Primary entity creation (you want the error to surface)
- Updates (use `.onConflictDoUpdate()` instead)
- Cases where duplicate means a bug, not a retry

## Error Handling — CRITICAL

### Drizzle v0.45 wraps Postgres errors

**NEVER check `err.code` directly. ALWAYS check `err.cause.code`.**

```typescript
// WRONG — err.code is undefined in Drizzle v0.45+
if (err.code === '23505') { ... }

// CORRECT — check both layers for safety
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as any).code === "23505") return true;
  if ("cause" in err && typeof (err as any).cause === "object" && (err as any).cause !== null) {
    return (err as any).cause.code === "23505";
  }
  return false;
}
```

Use the existing `isUniqueViolation()` helper from `packages/api/src/services/capture.ts`.

### Common Postgres error codes

| Code | Meaning | Drizzle Access |
|------|---------|----------------|
| 23505 | Unique violation | `err.cause?.code === '23505'` |
| 23503 | Foreign key violation | `err.cause?.code === '23503'` |
| 23502 | Not-null violation | `err.cause?.code === '23502'` |
| 23514 | Check constraint violation | `err.cause?.code === '23514'` |

## Migrations

### Migration files live in `packages/api/drizzle/`

Generate migrations with:

```bash
pnpm --filter @pm/api exec drizzle-kit generate
```

### Migration safety rules

- Migrations must be **additive** (no DROP COLUMN/TABLE without discussion)
- New columns must have defaults or be nullable
- Index creation on large tables: use `CREATE INDEX CONCURRENTLY`
- Functions and triggers: use `CREATE OR REPLACE`
- Enum additions: safe. Enum removals: dangerous (requires migration strategy)

### Existing patterns in migrations

- `set_updated_at()` trigger function auto-updates `updated_at` columns
- `get_entity_lineage()` recursive CTE for graph traversal
- Partial indexes for performance (e.g., `WHERE deleted_at IS NULL`, `WHERE status = 'pending'`)

## Checklist for New Database Code

- [ ] Table definition in `packages/api/src/db/schema/` with proper types and indexes
- [ ] Relations defined in `relations.ts`
- [ ] Schema exported from `packages/api/src/db/schema/index.ts`
- [ ] Queries use `tx` inside transactions, not `db`
- [ ] Idempotent inserts use `.onConflictDoNothing()`
- [ ] Error handling checks `err.cause.code` (not `err.code`)
- [ ] New columns have defaults or are nullable
- [ ] Migration generated and reviewed

## Context7 Documentation

For up-to-date Drizzle API reference, use Context7 MCP:
1. `resolve-library-id` with query "drizzle orm"
2. `query-docs` with the resolved ID and your specific question
