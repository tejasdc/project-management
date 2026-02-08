# Database Schema: AI-Powered Project Management System

Companion document to [`project-management-agent.md`](./project-management-agent.md).

This document defines the complete PostgreSQL schema using **Drizzle ORM** (pg-core) with equivalent raw SQL, TypeScript types for JSONB columns, `drizzle-zod` integration examples, index strategy, and the recursive CTE function for entity lineage queries.

---

## Table of Contents

1. [Schema Design Decisions](#schema-design-decisions)
2. [Enums](#enums)
3. [Tables](#tables)
   - [users](#users)
   - [projects](#projects)
   - [epics](#epics)
   - [entities](#entities)
   - [raw_notes](#raw_notes)
   - [entity_sources](#entity_sources)
   - [entity_relationships](#entity_relationships)
   - [tags](#tags)
   - [entity_tags](#entity_tags)
   - [review_queue](#review_queue)
   - [entity_events](#entity_events)
   - [api_keys](#api_keys)
4. [Drizzle Relations (for Relational Query API)](#drizzle-relations)
5. [TypeScript Types for JSONB Columns](#typescript-types-for-jsonb-columns)
6. [Drizzle-Zod Integration](#drizzle-zod-integration)
7. [Index Strategy](#index-strategy)
8. [Recursive CTE: Entity Lineage](#recursive-cte-entity-lineage)
9. [Equivalent Raw SQL](#equivalent-raw-sql)
10. [Future Considerations](#future-considerations)

---

## Schema Design Decisions

### 1. Soft Deletes via `deleted_at` Timestamp

**Decision: Use soft deletes (`deleted_at` nullable timestamp) on `entities`, `projects`, and `epics`.**

Rationale:
- Entity lineage/provenance requires historical data. Hard-deleting an entity breaks `entity_relationships` graph traversal.
- `raw_notes` are never deleted (they are the immutable source of truth).
- `review_queue` does not use soft deletes -- it uses lifecycle statuses (`pending`, `accepted`, `rejected`, `modified`) to track review item progression.
- `entity_sources`, `entity_relationships`, `tags`, and `entity_tags` use hard deletes -- they are structural links with no independent lifecycle.
- Queries that need "active only" add `WHERE deleted_at IS NULL`. A partial index on `deleted_at IS NULL` keeps this cheap.

### 2. Single `entities` Table with Discriminated JSONB (Not Table-Per-Type)

**Decision: One `entities` table with a `type` discriminator and a `attributes` JSONB column.**

Rationale:
- Three entity types (task, decision, insight) share 90% of their columns.
- Separate tables would require UNION queries for cross-type listings, complicate the relationships table (polymorphic FKs), and triple the migration surface.
- JSONB attributes give each type its own flexible schema without DDL changes.
- Drizzle's `.$type<T>()` on JSONB provides compile-time type safety.
- Trade-off: Cannot enforce JSONB structure at the database level. Validation happens in the application layer via Zod schemas (which is already the plan per the design doc).

### 3. `parent_task_id` as a Column, Not a JSONB Attribute

**Decision: Promote `parent_task_id` from the attributes JSONB to a first-class nullable FK column on `entities`.**

Rationale:
- The design doc mentions subtask hierarchy as a structural relationship (like `project_id` and `epic_id`).
- A real FK enables `ON DELETE` cascading, recursive CTEs for subtask trees, and indexed lookups.
- Keeping it in JSONB would require application-level enforcement of referential integrity and make subtask queries require JSON extraction.
- The column is nullable and only meaningful when `type = 'task'`. A CHECK constraint enforces this.

### 4. `assignee_id` as a Column, Not a JSONB Attribute

**Decision: Promote assignee to a first-class nullable FK column on `entities`.**

Rationale:
- Assignee is a common filter/grouping axis in the dashboard ("show me all my tasks").
- A real FK to `users` enables JOIN-based queries and referential integrity.
- The JSONB `attributes.owner` field from the design doc's extraction output is the AI's raw extraction (a name string). The application layer resolves this to a `user_id` and writes it to `assignee_id`. The raw string is preserved in attributes for audit.

### 5. Status as a Text Column with CHECK Constraint (Not pgEnum)

**Decision: Use `text` with a CHECK constraint instead of `pgEnum` for entity status.**

Rationale:
- Each entity type has different valid statuses. A single pgEnum would include all values, losing the per-type constraint.
- pgEnum in PostgreSQL is notoriously painful to modify (adding values requires `ALTER TYPE`, removing values is not supported without recreating the type).
- A CHECK constraint using `(type, status)` pairs enforces valid combinations and is trivially alterable.
- Drizzle pgEnums are fine for truly fixed sets (like `entity_type`, `note_source`). Status is more likely to evolve.

### 6. Timestamps: `withTimezone: true` Everywhere

**Decision: All timestamp columns use `timestamp with time zone`.**

Rationale:
- The system ingests from multiple sources (Slack, meetings, CLI) potentially across timezones.
- `timestamptz` stores in UTC and converts on read based on session timezone. This is the PostgreSQL best practice.
- `created_at` defaults to `now()`. `updated_at` defaults to `now()` and is updated via a trigger.

### 7. Review Queue as a Separate Table (Not a Status on Entities)

**Decision: `review_queue` is its own table referencing `entities`, not a boolean flag or status value on the entity.**

Rationale:
- A review item has its own lifecycle (pending review, resolved), its own data (AI suggestion, user resolution, training comment), and may reference entities that don't yet exist (e.g., suggested project assignments before the entity is fully routed).
- Multiple review items can exist for the same entity (e.g., one for type classification, one for project assignment).
- Keeps the entity table clean and the review workflow self-contained.

### 8. API Keys as a Separate Table (Not a Column on Users)

**Decision: `api_keys` is its own table referencing `users`, instead of a single `api_key_hash` column on the `users` table.**

Rationale:
- Users may need multiple API keys (e.g., one per device, one per CI environment).
- Individual keys can be named, revoked, and audited independently.
- `last_used_at` tracking per key enables security monitoring ("which keys are stale?").
- A `revoked_at` timestamp supports key rotation without hard-deleting historical records.
- The `api_keys_active_lookup_idx` index on `(key_hash, revoked_at)` supports the authentication hot path: "find the key by hash and confirm it is not revoked."

---

## Enums

```typescript
// src/db/schema/enums.ts

import { pgEnum } from "drizzle-orm/pg-core";

/** The three core entity types. Fixed by design -- unlikely to change. */
export const entityTypeEnum = pgEnum("entity_type", [
  "task",
  "decision",
  "insight",
]);

/** How the raw note was captured. New sources added as integrations ship. */
export const noteSourceEnum = pgEnum("note_source", [
  "cli",
  "slack",
  "voice_memo",
  "meeting_transcript",
  "obsidian",
  "mcp",
  "api",
]);

/** Who created an epic. */
export const epicCreatorEnum = pgEnum("epic_creator", [
  "user",
  "ai_suggestion",
]);

/** Relationship types between entities (graph edges). */
export const relationshipTypeEnum = pgEnum("relationship_type", [
  "derived_from",
  "related_to",
  "promoted_to",
  "duplicate_of",
]);

/** What kind of review is needed. */
export const reviewTypeEnum = pgEnum("review_type", [
  "type_classification",
  "project_assignment",
  "epic_assignment",
  "epic_creation",
  "duplicate_detection",
  "low_confidence",
  "assignee_suggestion",
]);

/** Review resolution status. */
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "accepted",
  "rejected",
  "modified",
]);

/** Project status. */
export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "archived",
]);

/** Event types for entity activity log. */
export const entityEventTypeEnum = pgEnum("entity_event_type", [
  "comment",
  "status_change",
  "reprocess",
]);
```

---

## Tables

### users

Lightweight team member table for assignee references and `captured_by` tracking.

```typescript
// src/db/schema/users.ts

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### projects

User-maintained list of active projects. Top of the organizational hierarchy.

```typescript
// src/db/schema/projects.ts

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projectStatusEnum } from "./enums";

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    status: projectStatusEnum().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_status_idx").on(table.status),
  ]
);
```

### epics

Intentional groupings within a project. Status is computed from children (not stored).

```typescript
// src/db/schema/epics.ts

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { epicCreatorEnum } from "./enums";
import { projects } from "./projects";

export const epics = pgTable(
  "epics",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: epicCreatorEnum("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("epics_project_id_idx").on(table.projectId),
  ]
);
```

### entities

The core table. Tasks, decisions, and insights all live here, differentiated by `type`.

```typescript
// src/db/schema/entities.ts

import { pgTable, uuid, text, real, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { entityTypeEnum } from "./enums";
import { projects } from "./projects";
import { epics } from "./epics";
import { users } from "./users";
import type {
  TaskAttributes,
  DecisionAttributes,
  InsightAttributes,
  EntityAiMeta,
  EntityEvidence,
} from "./types";

export const entities = pgTable(
  "entities",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: entityTypeEnum().notNull(),
    content: text().notNull(),
    status: text().notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    epicId: uuid("epic_id").references(() => epics.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id").references((): any => entities.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    confidence: real().notNull().default(1.0),
    attributes: jsonb().$type<TaskAttributes | DecisionAttributes | InsightAttributes>(),
    aiMeta: jsonb("ai_meta").$type<EntityAiMeta>(),
    evidence: jsonb("evidence").$type<EntityEvidence[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // -- Core query patterns --
    index("entities_project_id_idx").on(table.projectId),
    index("entities_epic_id_idx").on(table.epicId),
    index("entities_assignee_id_idx").on(table.assigneeId),
    index("entities_parent_task_id_idx").on(table.parentTaskId),

    // Composite index for the most common dashboard query:
    // "List all entities for project X, filtered by type and status"
    index("entities_project_type_status_idx").on(
      table.projectId,
      table.type,
      table.status
    ),

    // Low-confidence items (for review queue population)
    index("entities_confidence_idx").on(table.confidence),

    // Partial index for active-only queries (skip soft-deleted rows)
    index("entities_active_idx")
      .on(table.projectId, table.type)
      .where(sql`deleted_at IS NULL`),

    // -- CHECK constraints --
    // Ensure status values are valid per entity type
    check(
      "valid_entity_status",
      sql`(
        (type = 'task' AND status IN ('captured', 'needs_action', 'in_progress', 'done'))
        OR (type = 'decision' AND status IN ('pending', 'decided'))
        OR (type = 'insight' AND status IN ('captured', 'acknowledged'))
      )`
    ),
    // parent_task_id only allowed on tasks
    check(
      "parent_task_only_for_tasks",
      sql`(type = 'task' OR parent_task_id IS NULL)`
    ),
  ]
);
```

### raw_notes

Original unmodified inputs from all capture surfaces. Immutable source of truth.

```typescript
// src/db/schema/raw-notes.ts

import { pgTable, uuid, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noteSourceEnum } from "./enums";
import { users } from "./users";
import type { SourceMeta } from "./types";

export const rawNotes = pgTable(
  "raw_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    content: text().notNull(),
    source: noteSourceEnum().notNull(),
    externalId: text("external_id"),
    sourceMeta: jsonb("source_meta").$type<SourceMeta>(),
    capturedBy: uuid("captured_by").references(() => users.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    processed: boolean().notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The processing pipeline's primary query: "give me unprocessed notes ordered by capture time"
    index("raw_notes_unprocessed_captured_at_idx")
      .on(table.capturedAt, table.id)
      .where(sql`processed = false`),
    index("raw_notes_source_idx").on(table.source),
    index("raw_notes_captured_by_idx").on(table.capturedBy),
    index("raw_notes_captured_at_idx").on(table.capturedAt),
    // Deduplicate ingestion from the same source (e.g., same Slack message ID)
    uniqueIndex("raw_notes_source_external_id_uq")
      .on(table.source, table.externalId)
      .where(sql`external_id IS NOT NULL`),
  ]
);
```

Note: `raw_notes` has `createdAt` but no `updatedAt` or `deletedAt`. Raw notes are append-only. The only mutation is marking `processed = true` and setting `processedAt` (or `processingError`). They are never modified or deleted.

### entity_sources

Join table linking entities to the raw notes they were extracted from. Many-to-many.

```typescript
// src/db/schema/entity-sources.ts

import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { rawNotes } from "./raw-notes";

export const entitySources = pgTable(
  "entity_sources",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    rawNoteId: uuid("raw_note_id")
      .notNull()
      .references(() => rawNotes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.rawNoteId] }),
    // Reverse lookup: "which entities were extracted from this raw note?"
    index("entity_sources_raw_note_id_idx").on(table.rawNoteId),
  ]
);
```

### entity_relationships

Graph edges for provenance, lineage, and association. These feed the future Work Evolution Tracker.

```typescript
// src/db/schema/entity-relationships.ts

import { pgTable, uuid, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relationshipTypeEnum } from "./enums";
import { entities } from "./entities";
import type { RelationshipMeta } from "./types";

export const entityRelationships = pgTable(
  "entity_relationships",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relationshipType: relationshipTypeEnum("relationship_type").notNull(),
    metadata: jsonb().$type<RelationshipMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Traverse forward: "what did this entity produce?"
    index("entity_rel_source_id_idx").on(table.sourceId),
    // Traverse backward: "where did this entity come from?"
    index("entity_rel_target_id_idx").on(table.targetId),
    // Filter by relationship type
    index("entity_rel_type_idx").on(table.relationshipType),
    // Composite for typed traversal: "all derived_from edges from entity X"
    index("entity_rel_source_type_idx").on(table.sourceId, table.relationshipType),
    // Prevent duplicate edges between the same pair with the same type
    uniqueIndex("entity_rel_unique_edge_uq").on(
      table.sourceId,
      table.targetId,
      table.relationshipType
    ),
  ]
);
```

### tags

Tag definitions. Used for `about` tagging on entities (topics, features, areas).

```typescript
// src/db/schema/tags.ts

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const tags = pgTable("tags", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### entity_tags

Join table for many-to-many relationship between entities and tags.

```typescript
// src/db/schema/entity-tags.ts

import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { tags } from "./tags";

export const entityTags = pgTable(
  "entity_tags",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.tagId] }),
  ]
);
```

### review_queue

Items requiring human review. Tracks AI suggestions, user resolutions, and training comments for the DSPy feedback loop. Can reference either an entity or a project (or both).

```typescript
// src/db/schema/review-queue.ts

import { pgTable, uuid, text, real, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { reviewTypeEnum, reviewStatusEnum } from "./enums";
import { entities } from "./entities";
import { projects } from "./projects";
import { users } from "./users";
import type { ReviewSuggestion } from "./types";

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .references(() => entities.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "set null" }),
    reviewType: reviewTypeEnum("review_type").notNull(),
    status: reviewStatusEnum().notNull().default("pending"),

    // What the AI suggested
    aiSuggestion: jsonb("ai_suggestion").$type<ReviewSuggestion>().notNull(),
    aiConfidence: real("ai_confidence").notNull(),

    // How the user resolved it
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    userResolution: jsonb("user_resolution").$type<ReviewSuggestion>(),

    // Training comment for DSPy feedback loop
    trainingComment: text("training_comment"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The review UI's primary query: "all pending review items, newest first"
    index("review_queue_pending_idx")
      .on(table.createdAt)
      .where(sql`status = 'pending'`),
    index("review_queue_entity_id_idx").on(table.entityId),
    index("review_queue_project_id_idx").on(table.projectId),
    index("review_queue_review_type_idx").on(table.reviewType),
    // For DSPy training data export: "all resolved items with training comments"
    index("review_queue_resolved_idx")
      .on(table.status, table.resolvedAt),
    // Prevent duplicate pending reviews for the same entity + review type
    uniqueIndex("review_queue_pending_unique_entity_review_type")
      .on(table.entityId, table.reviewType)
      .where(sql`status = 'pending' AND entity_id IS NOT NULL`),
    // At least one of entity_id or project_id must be set
    check(
      "review_queue_entity_or_project",
      sql`(entity_id IS NOT NULL OR project_id IS NOT NULL)`
    ),
  ]
);
```

### entity_events

Activity log for entities. Tracks comments, status changes, and reprocessing events.

```typescript
// src/db/schema/entity-events.ts

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { entityEventTypeEnum } from "./enums";
import { entities } from "./entities";
import { users } from "./users";
import { rawNotes } from "./raw-notes";
import type { EntityEventMeta } from "./types";

export const entityEvents = pgTable(
  "entity_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: entityEventTypeEnum("type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    rawNoteId: uuid("raw_note_id").references(() => rawNotes.id, { onDelete: "set null" }),
    body: text(),
    oldStatus: text("old_status"),
    newStatus: text("new_status"),
    meta: jsonb().$type<EntityEventMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("entity_events_entity_id_created_at_idx").on(table.entityId, table.createdAt),
    index("entity_events_actor_user_id_idx").on(table.actorUserId),
  ]
);
```

Note: `entity_events` has `createdAt` but no `updatedAt`. Events are append-only -- once recorded, they are never modified.

### api_keys

Per-user API keys for authentication. Supports multiple named keys with independent revocation and usage tracking.

```typescript
// src/db/schema/api-keys.ts

import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_uq").on(table.keyHash),
    index("api_keys_active_lookup_idx").on(table.keyHash, table.revokedAt),
  ]
);
```

Note: `api_keys` has `createdAt` but no `updatedAt`. The only mutations are setting `last_used_at` (on each request) and `revoked_at` (on revocation). No trigger is needed.

### Schema Barrel Export

```typescript
// src/db/schema/index.ts

export * from "./enums";
export * from "./users";
export * from "./projects";
export * from "./epics";
export * from "./entities";
export * from "./raw-notes";
export * from "./entity-sources";
export * from "./entity-relationships";
export * from "./tags";
export * from "./entity-tags";
export * from "./review-queue";
export * from "./entity-events";
export * from "./api-keys";
export * from "./relations";
export * from "./types";
```

---

## Drizzle Relations

Drizzle relations are declarative hints for the Relational Query API (`db.query.entities.findMany({ with: { project: true } })`). They do not create database constraints -- the FK references on the columns handle that.

```typescript
// src/db/schema/relations.ts

import { relations } from "drizzle-orm";
import { users } from "./users";
import { projects } from "./projects";
import { epics } from "./epics";
import { entities } from "./entities";
import { rawNotes } from "./raw-notes";
import { entitySources } from "./entity-sources";
import { entityRelationships } from "./entity-relationships";
import { tags } from "./tags";
import { entityTags } from "./entity-tags";
import { reviewQueue } from "./review-queue";
import { entityEvents } from "./entity-events";
import { apiKeys } from "./api-keys";

// -- Users --
export const usersRelations = relations(users, ({ many }) => ({
  assignedEntities: many(entities),
  capturedNotes: many(rawNotes),
  reviewsResolved: many(reviewQueue),
  entityEvents: many(entityEvents),
  apiKeys: many(apiKeys),
}));

// -- Projects --
export const projectsRelations = relations(projects, ({ many }) => ({
  epics: many(epics),
  entities: many(entities),
  reviews: many(reviewQueue),
}));

// -- Epics --
export const epicsRelations = relations(epics, ({ one, many }) => ({
  project: one(projects, {
    fields: [epics.projectId],
    references: [projects.id],
  }),
  entities: many(entities),
}));

// -- Entities --
export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, {
    fields: [entities.projectId],
    references: [projects.id],
  }),
  epic: one(epics, {
    fields: [entities.epicId],
    references: [epics.id],
  }),
  parentTask: one(entities, {
    fields: [entities.parentTaskId],
    references: [entities.id],
    relationName: "subtasks",
  }),
  subtasks: many(entities, { relationName: "subtasks" }),
  assignee: one(users, {
    fields: [entities.assigneeId],
    references: [users.id],
  }),
  // Many-to-many: entity <-> raw notes (via entity_sources)
  entitySources: many(entitySources),
  // Many-to-many: entity <-> tags (via entity_tags)
  entityTags: many(entityTags),
  // Graph edges where this entity is the source
  outgoingRelationships: many(entityRelationships, {
    relationName: "sourceEntity",
  }),
  // Graph edges where this entity is the target
  incomingRelationships: many(entityRelationships, {
    relationName: "targetEntity",
  }),
  // Review queue items for this entity
  reviews: many(reviewQueue),
  // Activity log
  events: many(entityEvents),
}));

// -- Raw Notes --
export const rawNotesRelations = relations(rawNotes, ({ one, many }) => ({
  capturedByUser: one(users, {
    fields: [rawNotes.capturedBy],
    references: [users.id],
  }),
  entitySources: many(entitySources),
  entityEvents: many(entityEvents),
}));

// -- Entity Sources (join table) --
export const entitySourcesRelations = relations(entitySources, ({ one }) => ({
  entity: one(entities, {
    fields: [entitySources.entityId],
    references: [entities.id],
  }),
  rawNote: one(rawNotes, {
    fields: [entitySources.rawNoteId],
    references: [rawNotes.id],
  }),
}));

// -- Entity Relationships (graph edges) --
export const entityRelationshipsRelations = relations(
  entityRelationships,
  ({ one }) => ({
    source: one(entities, {
      fields: [entityRelationships.sourceId],
      references: [entities.id],
      relationName: "sourceEntity",
    }),
    target: one(entities, {
      fields: [entityRelationships.targetId],
      references: [entities.id],
      relationName: "targetEntity",
    }),
  })
);

// -- Tags --
export const tagsRelations = relations(tags, ({ many }) => ({
  entityTags: many(entityTags),
}));

// -- Entity Tags (join table) --
export const entityTagsRelations = relations(entityTags, ({ one }) => ({
  entity: one(entities, {
    fields: [entityTags.entityId],
    references: [entities.id],
  }),
  tag: one(tags, {
    fields: [entityTags.tagId],
    references: [tags.id],
  }),
}));

// -- Review Queue --
export const reviewQueueRelations = relations(reviewQueue, ({ one }) => ({
  entity: one(entities, {
    fields: [reviewQueue.entityId],
    references: [entities.id],
  }),
  project: one(projects, {
    fields: [reviewQueue.projectId],
    references: [projects.id],
  }),
  resolver: one(users, {
    fields: [reviewQueue.resolvedBy],
    references: [users.id],
  }),
}));

// -- Entity Events --
export const entityEventsRelations = relations(entityEvents, ({ one }) => ({
  entity: one(entities, {
    fields: [entityEvents.entityId],
    references: [entities.id],
  }),
  actor: one(users, {
    fields: [entityEvents.actorUserId],
    references: [users.id],
  }),
  rawNote: one(rawNotes, {
    fields: [entityEvents.rawNoteId],
    references: [rawNotes.id],
  }),
}));

// -- API Keys --
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
```

---

## TypeScript Types for JSONB Columns

These types define the shape of each JSONB column. They are used with Drizzle's `.$type<T>()` for compile-time safety and with Zod schemas for runtime validation.

```typescript
// src/db/schema/types.ts

// ============================================================
// Entity Attributes (the `attributes` JSONB on entities table)
// ============================================================

export type TaskCategory =
  | "feature"
  | "bug_fix"
  | "improvement"
  | "chore"
  | "refactor"
  | "story";

export type Priority = "critical" | "high" | "medium" | "low";

export type Complexity = "small" | "medium" | "large";

export interface TaskAttributes {
  /** What kind of task: feature, bug fix, refactor, etc. */
  category?: TaskCategory;
  /**
   * Raw owner/assignee string extracted by AI (e.g., "Sarah").
   * The application layer resolves this to `entities.assignee_id`.
   * Preserved here for audit and for cases where no matching user exists.
   */
  owner?: string;
  /** AI-suggested or user-set priority. */
  priority?: Priority;
  /** Rough size estimate. */
  complexity?: Complexity;
  /** Free-form key-value pairs for extensibility. */
  [key: string]: unknown;
}

export interface DecisionAttributes {
  /** Available options considered. */
  options?: string[];
  /** The chosen option (null if still pending). */
  chosen?: string | null;
  /** Why this option was chosen. */
  rationale?: string;
  /** Who made the decision (name string from extraction). */
  decidedBy?: string;
  [key: string]: unknown;
}

export interface InsightAttributes {
  /** Positive, negative, neutral, mixed. */
  sentiment?: string;
  /** Supporting data points or evidence. */
  dataPoints?: string[];
  /** How feasible is acting on this insight. */
  feasibility?: string;
  [key: string]: unknown;
}

/** Union type for the attributes column. Discriminate on `entities.type`. */
export type EntityAttributes =
  | TaskAttributes
  | DecisionAttributes
  | InsightAttributes;

// ============================================================
// Entity Evidence (the `evidence` JSONB on entities table)
// ============================================================

export interface EntityEvidence {
  rawNoteId: string;
  quote: string;
  startOffset?: number;
  endOffset?: number;
  permalink?: string;
}

// ============================================================
// Entity AI Metadata (the `ai_meta` JSONB on entities table)
// ============================================================

export interface FieldConfidence {
  confidence: number;
  reason?: string;
  evidence?: EntityEvidence[];
}

export interface EntityAiMeta {
  model?: string;
  promptVersion?: string;
  extractionRunId?: string;
  fieldConfidence?: Record<string, FieldConfidence>;
  [key: string]: unknown;
}

// ============================================================
// Entity Event Metadata (the `meta` JSONB on entity_events table)
// ============================================================

export interface EntityEventMeta {
  jobId?: string;
  model?: string;
  promptVersion?: string;
  reason?: string;
  [key: string]: unknown;
}

// ============================================================
// Source Meta (the `source_meta` JSONB on raw_notes table)
// ============================================================

export interface SlackSourceMeta {
  channelId: string;
  channelName?: string;
  messageTs: string;
  threadTs?: string;
  userId?: string;
  permalink?: string;
}

export interface VoiceMemoSourceMeta {
  durationSeconds?: number;
  transcriptionModel?: string;
  transcriptionConfidence?: number;
  originalFileUrl?: string;
}

export interface MeetingTranscriptSourceMeta {
  meetingId?: string;
  meetingTitle?: string;
  platform?: "fireflies" | "google_meet" | "zoom";
  participants?: string[];
  durationMinutes?: number;
  /** Pre-extracted items from Fireflies.ai, if available. */
  preExtractedItems?: {
    actionItems?: string[];
    decisions?: string[];
    questions?: string[];
  };
}

export interface ObsidianSourceMeta {
  filePath?: string;
  vaultName?: string;
}

export interface CliSourceMeta {
  workingDirectory?: string;
  gitBranch?: string;
}

/** Union type for source_meta. Discriminate on `raw_notes.source`. */
export type SourceMeta =
  | SlackSourceMeta
  | VoiceMemoSourceMeta
  | MeetingTranscriptSourceMeta
  | ObsidianSourceMeta
  | CliSourceMeta
  | Record<string, unknown>;

// ============================================================
// Relationship Metadata (the `metadata` JSONB on entity_relationships)
// ============================================================

export interface RelationshipMeta {
  /** Why this relationship was created. */
  reason?: string;
  /** AI confidence in this relationship. */
  confidence?: number;
  /** Who or what created this relationship. */
  createdBy?: "ai" | "user";
  [key: string]: unknown;
}

// ============================================================
// Review Queue Suggestion (the `ai_suggestion` and `user_resolution` JSONB)
// ============================================================

export interface ReviewSuggestion {
  /** For type_classification: the suggested entity type. */
  suggestedType?: "task" | "decision" | "insight";
  /** For project_assignment: the suggested project ID. */
  suggestedProjectId?: string;
  /** For project_assignment: the suggested project name (for display). */
  suggestedProjectName?: string;
  /** For epic_assignment: the suggested epic ID. */
  suggestedEpicId?: string;
  /** For epic_assignment: the suggested epic name (for display). */
  suggestedEpicName?: string;
  /** For epic_creation: the proposed name for the new epic. */
  proposedEpicName?: string;
  /** For epic_creation: the proposed description for the new epic. */
  proposedEpicDescription?: string | null;
  /** For epic_creation: the project the new epic should belong to. */
  proposedEpicProjectId?: string;
  /** For duplicate_detection: the ID of the suspected duplicate entity. */
  duplicateEntityId?: string;
  /** For duplicate_detection: similarity score. */
  similarityScore?: number;
  /** For assignee_suggestion: the suggested user ID. */
  suggestedAssigneeId?: string;
  /** For assignee_suggestion: the raw name string from extraction. */
  suggestedAssigneeName?: string;
  /** Human-readable explanation of why this was suggested. */
  explanation?: string;
  [key: string]: unknown;
}
```

---

## Drizzle-Zod Integration

`drizzle-zod` generates Zod schemas directly from Drizzle table definitions, creating a single source of truth: **DB schema -> Zod schema -> API validation**.

### Installation

```bash
npm i drizzle-zod zod
```

### Basic Usage

```typescript
// src/db/validation.ts

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { entities } from "./schema/entities";
import { rawNotes } from "./schema/raw-notes";
import { projects } from "./schema/projects";
import { epics } from "./schema/epics";
import { reviewQueue } from "./schema/review-queue";

// ============================================================
// Auto-generated schemas from Drizzle tables
// ============================================================

// -- Entities --
export const entityInsertSchema = createInsertSchema(entities, {
  // Override/refine auto-generated types where needed
  content: (schema) => schema.min(1, "Content cannot be empty"),
  confidence: (schema) => schema.min(0).max(1),
});

export const entitySelectSchema = createSelectSchema(entities);

// -- Raw Notes --
export const rawNoteInsertSchema = createInsertSchema(rawNotes, {
  content: (schema) => schema.min(1, "Content cannot be empty"),
});

export const rawNoteSelectSchema = createSelectSchema(rawNotes);

// -- Projects --
export const projectInsertSchema = createInsertSchema(projects, {
  name: (schema) => schema.min(1, "Project name cannot be empty"),
});

export const projectSelectSchema = createSelectSchema(projects);

// -- Epics --
export const epicInsertSchema = createInsertSchema(epics, {
  name: (schema) => schema.min(1, "Epic name cannot be empty"),
});

export const epicSelectSchema = createSelectSchema(epics);

// -- Review Queue --
export const reviewQueueInsertSchema = createInsertSchema(reviewQueue);
export const reviewQueueSelectSchema = createSelectSchema(reviewQueue);

// ============================================================
// Custom Zod schemas for JSONB validation
// ============================================================

export const taskAttributesSchema = z.object({
  category: z
    .enum(["feature", "bug_fix", "improvement", "chore", "refactor", "story"])
    .optional(),
  owner: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  complexity: z.enum(["small", "medium", "large"]).optional(),
}).passthrough();

export const decisionAttributesSchema = z.object({
  options: z.array(z.string()).optional(),
  chosen: z.string().nullable().optional(),
  rationale: z.string().optional(),
  decidedBy: z.string().optional(),
}).passthrough();

export const insightAttributesSchema = z.object({
  sentiment: z.string().optional(),
  dataPoints: z.array(z.string()).optional(),
  feasibility: z.string().optional(),
}).passthrough();

/**
 * Discriminated union: validate attributes based on entity type.
 * Use this in the API layer when creating/updating entities.
 */
export const entityWithAttributesSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("task"),
    attributes: taskAttributesSchema.optional(),
  }),
  z.object({
    type: z.literal("decision"),
    attributes: decisionAttributesSchema.optional(),
  }),
  z.object({
    type: z.literal("insight"),
    attributes: insightAttributesSchema.optional(),
  }),
]);

// ============================================================
// Hono integration example (Zod middleware)
// ============================================================

/*
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

app.post(
  "/api/entities",
  zValidator("json", entityInsertSchema),
  async (c) => {
    const data = c.req.valid("json");
    // data is fully typed and validated
    const result = await db.insert(entities).values(data).returning();
    return c.json(result[0], 201);
  }
);

app.post(
  "/api/notes",
  zValidator("json", rawNoteInsertSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await db.insert(rawNotes).values(data).returning();
    return c.json(result[0], 201);
  }
);
*/
```

### Factory Pattern for Extended Zod (Hono OpenAPI)

If using `@hono/zod-openapi` for auto-generated API docs, use `createSchemaFactory`:

```typescript
import { createSchemaFactory } from "drizzle-zod";
import { z } from "@hono/zod-openapi";

const { createInsertSchema, createSelectSchema } = createSchemaFactory({
  zodInstance: z,
});

// Now all generated schemas support .openapi() metadata
const entityInsertSchema = createInsertSchema(entities, {
  content: (schema) =>
    schema.min(1).openapi({ example: "Redesign the onboarding flow" }),
});
```

---

## Index Strategy

### Common Query Patterns and Their Supporting Indexes

| Query Pattern | Index | Notes |
|---|---|---|
| List entities for a project, filtered by type/status | `entities_project_type_status_idx` (composite) | Covers the dashboard's primary view. Column order matters: project first (equality), then type (equality), then status (equality or range). |
| List entities for a project (active only) | `entities_active_idx` (partial, `WHERE deleted_at IS NULL`) | Smaller index -- excludes soft-deleted rows. |
| List unprocessed raw notes | `raw_notes_unprocessed_captured_at_idx` (partial, `WHERE processed = false`) | The processing pipeline polls this. Ordered by `captured_at, id` for stable pagination. Partial index keeps it tiny as notes get processed. |
| List pending review items | `review_queue_pending_idx` (partial, `WHERE status = 'pending'`) | The review UI's primary query. Ordered by `created_at` for newest-first display. Shrinks as items are resolved. |
| Prevent duplicate pending reviews | `review_queue_pending_unique_entity_review_type` (unique partial) | Ensures only one pending review per entity + review type combination. |
| Entity lineage traversal (recursive CTE) | `entity_rel_source_id_idx`, `entity_rel_target_id_idx` | Each CTE iteration looks up by source_id (forward) or target_id (backward). |
| Prevent duplicate relationship edges | `entity_rel_unique_edge_uq` (unique) | Ensures no duplicate (source, target, type) triples. |
| Typed relationship traversal | `entity_rel_source_type_idx` (composite) | "All `derived_from` edges from entity X." |
| List entities by assignee | `entities_assignee_id_idx` | "Show me all my tasks." |
| List subtasks of a task | `entities_parent_task_id_idx` | Subtask tree queries. |
| List epics for a project | `epics_project_id_idx` | Project detail view. |
| Reverse provenance: entities from a raw note | `entity_sources_raw_note_id_idx` | "Which entities were extracted from this note?" Bidirectional provenance lookup. |
| Deduplicate raw note ingestion | `raw_notes_source_external_id_uq` (unique partial) | Prevents re-ingesting the same external message (e.g., Slack message ID). |
| Entity event timeline | `entity_events_entity_id_created_at_idx` (composite) | "Show activity log for entity X, ordered by time." |
| Events by actor | `entity_events_actor_user_id_idx` | "Show all actions by user Y." |
| Authenticate API key | `api_keys_active_lookup_idx` (composite) | Hot path: find key by hash and check revocation status. |
| Unique key hash | `api_keys_key_hash_uq` (unique) | Ensures no duplicate key hashes. |
| Find entities by tag | Join through `entity_tags` | The composite PK on `entity_tags(entity_id, tag_id)` serves as the index. For "find all entities with tag X", Postgres will use the `tag_id` column -- but since it is second in the PK, add an explicit index if this query is frequent (see Future Considerations). |
| Search for duplicates (embedding similarity) | **Not yet added** | Requires `pgvector` extension and a vector column. See Future Considerations. |

### Indexes NOT Added (and Why)

- **Full-text search on `entities.content`**: Not needed at launch. The AI extraction pipeline handles search/matching. Add a GIN index on a `tsvector` column if full-text search becomes a requirement.
- **GIN index on `attributes` JSONB**: Not needed unless we query JSONB fields directly in SQL (e.g., `WHERE attributes->>'priority' = 'high'`). The design routes these queries through the application layer with proper Zod-validated filters. If direct JSONB queries become frequent, add a GIN index with `jsonb_path_ops`.
- **`entity_tags(tag_id)` single-column index**: The composite PK `(entity_id, tag_id)` lets Postgres look up "tags for entity X" efficiently. The reverse ("entities for tag X") would benefit from a separate index on `tag_id` alone -- add it when tag-based filtering is implemented.

---

## Recursive CTE: Entity Lineage

A reusable SQL function that traverses the `entity_relationships` graph to find the full lineage (ancestors and/or descendants) of a given entity.

### SQL Function

```sql
-- Get the full lineage of an entity.
-- direction: 'ancestors' (traverse backward), 'descendants' (traverse forward), 'both'
-- max_depth: safety limit to prevent infinite loops (default 20)
CREATE OR REPLACE FUNCTION get_entity_lineage(
  p_entity_id UUID,
  p_direction TEXT DEFAULT 'both',
  p_max_depth INT DEFAULT 20,
  p_relationship_types TEXT[] DEFAULT NULL  -- NULL means all types
)
RETURNS TABLE (
  entity_id UUID,
  entity_type TEXT,
  entity_content TEXT,
  entity_status TEXT,
  relationship_type TEXT,
  relationship_direction TEXT,  -- 'ancestor' or 'descendant'
  depth INT,
  path UUID[]  -- ordered list of entity IDs from root to this node
)
LANGUAGE sql STABLE
AS $$
  -- Ancestors: walk backward (target_id -> source_id)
  WITH RECURSIVE ancestors AS (
    -- Base case: direct parents of the target entity
    SELECT
      er.source_id AS entity_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.source_id] AS path
    FROM entity_relationships er
    WHERE er.target_id = p_entity_id
      AND (p_direction IN ('ancestors', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    -- Recursive case: parents of parents
    SELECT
      er.source_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT,
      a.depth + 1,
      a.path || er.source_id
    FROM entity_relationships er
    JOIN ancestors a ON er.target_id = a.entity_id
    WHERE a.depth < p_max_depth
      AND NOT (er.source_id = ANY(a.path))  -- cycle detection
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  -- Descendants: walk forward (source_id -> target_id)
  descendants AS (
    SELECT
      er.target_id AS entity_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.target_id] AS path
    FROM entity_relationships er
    WHERE er.source_id = p_entity_id
      AND (p_direction IN ('descendants', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    SELECT
      er.target_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT,
      d.depth + 1,
      d.path || er.target_id
    FROM entity_relationships er
    JOIN descendants d ON er.source_id = d.entity_id
    WHERE d.depth < p_max_depth
      AND NOT (er.target_id = ANY(d.path))  -- cycle detection
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  -- Combine results
  combined AS (
    SELECT * FROM ancestors
    UNION ALL
    SELECT * FROM descendants
  )

  -- Join with entities to get full entity data
  SELECT
    c.entity_id,
    e.type::TEXT AS entity_type,
    e.content AS entity_content,
    e.status AS entity_status,
    c.relationship_type,
    c.relationship_direction,
    c.depth,
    c.path
  FROM combined c
  JOIN entities e ON e.id = c.entity_id
  WHERE e.deleted_at IS NULL  -- skip soft-deleted entities
  ORDER BY c.relationship_direction, c.depth, c.entity_id;
$$;
```

### Usage Examples

```sql
-- Full lineage (ancestors + descendants) of an entity
SELECT * FROM get_entity_lineage('a1b2c3d4-...');

-- Only ancestors (where did this come from?)
SELECT * FROM get_entity_lineage('a1b2c3d4-...', 'ancestors');

-- Only descendants (what did this produce?)
SELECT * FROM get_entity_lineage('a1b2c3d4-...', 'descendants');

-- Only 'derived_from' relationships, max 5 levels deep
SELECT * FROM get_entity_lineage(
  'a1b2c3d4-...',
  'both',
  5,
  ARRAY['derived_from']
);

-- Trace the promotion chain: insight -> task
SELECT * FROM get_entity_lineage(
  'a1b2c3d4-...',
  'descendants',
  10,
  ARRAY['promoted_to']
);
```

### Calling from Drizzle ORM

```typescript
import { sql } from "drizzle-orm";

// In your repository/service layer
async function getEntityLineage(
  db: DrizzleDB,
  entityId: string,
  direction: "ancestors" | "descendants" | "both" = "both",
  maxDepth: number = 20,
  relationshipTypes?: string[]
) {
  const result = await db.execute(sql`
    SELECT * FROM get_entity_lineage(
      ${entityId}::uuid,
      ${direction},
      ${maxDepth},
      ${relationshipTypes ? sql`${relationshipTypes}::text[]` : sql`NULL`}
    )
  `);
  return result.rows;
}
```

---

## `updated_at` Trigger

A database-level trigger to automatically set `updated_at` on row modification. This is more reliable than application-level updates (which can be forgotten).

```sql
-- Generic trigger function (reusable across all tables with updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table that has updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_epics_updated_at
  BEFORE UPDATE ON epics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_review_queue_updated_at
  BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Note: `entity_events`, `api_keys`, `raw_notes`, `entity_sources`, `entity_relationships`, `tags`, and `entity_tags` do not have `updated_at` columns and therefore do not need this trigger.

---

## Equivalent Raw SQL

The complete schema as raw SQL, for reference and for environments where Drizzle migrations are not used.

```sql
-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE entity_type AS ENUM ('task', 'decision', 'insight');
CREATE TYPE note_source AS ENUM ('cli', 'slack', 'voice_memo', 'meeting_transcript', 'obsidian', 'mcp', 'api');
CREATE TYPE epic_creator AS ENUM ('user', 'ai_suggestion');
CREATE TYPE relationship_type AS ENUM ('derived_from', 'related_to', 'promoted_to', 'duplicate_of');
CREATE TYPE review_type AS ENUM ('type_classification', 'project_assignment', 'epic_assignment', 'epic_creation', 'duplicate_detection', 'low_confidence', 'assignee_suggestion');
CREATE TYPE review_status AS ENUM ('pending', 'accepted', 'rejected', 'modified');
CREATE TYPE project_status AS ENUM ('active', 'archived');
CREATE TYPE entity_event_type AS ENUM ('comment', 'status_change', 'reprocess');

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status project_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX projects_status_idx ON projects (status);

CREATE TABLE epics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by epic_creator NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX epics_project_id_idx ON epics (project_id);

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type entity_type NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  epic_id UUID REFERENCES epics(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  attributes JSONB,
  ai_meta JSONB,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  -- Status must be valid for the entity type
  CONSTRAINT valid_entity_status CHECK (
    (type = 'task' AND status IN ('captured', 'needs_action', 'in_progress', 'done'))
    OR (type = 'decision' AND status IN ('pending', 'decided'))
    OR (type = 'insight' AND status IN ('captured', 'acknowledged'))
  ),

  -- Only tasks can have a parent task
  CONSTRAINT parent_task_only_for_tasks CHECK (
    type = 'task' OR parent_task_id IS NULL
  )
);

CREATE INDEX entities_project_id_idx ON entities (project_id);
CREATE INDEX entities_epic_id_idx ON entities (epic_id);
CREATE INDEX entities_assignee_id_idx ON entities (assignee_id);
CREATE INDEX entities_parent_task_id_idx ON entities (parent_task_id);
CREATE INDEX entities_project_type_status_idx ON entities (project_id, type, status);
CREATE INDEX entities_confidence_idx ON entities (confidence);
CREATE INDEX entities_active_idx ON entities (project_id, type) WHERE deleted_at IS NULL;

CREATE TABLE raw_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source note_source NOT NULL,
  external_id TEXT,
  source_meta JSONB,
  captured_by UUID REFERENCES users(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX raw_notes_unprocessed_captured_at_idx ON raw_notes (captured_at, id) WHERE processed = false;
CREATE INDEX raw_notes_source_idx ON raw_notes (source);
CREATE INDEX raw_notes_captured_by_idx ON raw_notes (captured_by);
CREATE INDEX raw_notes_captured_at_idx ON raw_notes (captured_at);
CREATE UNIQUE INDEX raw_notes_source_external_id_uq ON raw_notes (source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE entity_sources (
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  raw_note_id UUID NOT NULL REFERENCES raw_notes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, raw_note_id)
);

CREATE INDEX entity_sources_raw_note_id_idx ON entity_sources (raw_note_id);

CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entity_rel_source_id_idx ON entity_relationships (source_id);
CREATE INDEX entity_rel_target_id_idx ON entity_relationships (target_id);
CREATE INDEX entity_rel_type_idx ON entity_relationships (relationship_type);
CREATE INDEX entity_rel_source_type_idx ON entity_relationships (source_id, relationship_type);
CREATE UNIQUE INDEX entity_rel_unique_edge_uq ON entity_relationships (source_id, target_id, relationship_type);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entity_tags (
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, tag_id)
);

CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  review_type review_type NOT NULL,
  status review_status NOT NULL DEFAULT 'pending',
  ai_suggestion JSONB NOT NULL,
  ai_confidence REAL NOT NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  user_resolution JSONB,
  training_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one of entity_id or project_id must be set
  CONSTRAINT review_queue_entity_or_project CHECK (
    entity_id IS NOT NULL OR project_id IS NOT NULL
  )
);

CREATE INDEX review_queue_pending_idx ON review_queue (created_at) WHERE status = 'pending';
CREATE INDEX review_queue_entity_id_idx ON review_queue (entity_id);
CREATE INDEX review_queue_project_id_idx ON review_queue (project_id);
CREATE INDEX review_queue_review_type_idx ON review_queue (review_type);
CREATE INDEX review_queue_resolved_idx ON review_queue (status, resolved_at);
CREATE UNIQUE INDEX review_queue_pending_unique_entity_review_type ON review_queue (entity_id, review_type) WHERE status = 'pending' AND entity_id IS NOT NULL;

CREATE TABLE entity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type entity_event_type NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  raw_note_id UUID REFERENCES raw_notes(id) ON DELETE SET NULL,
  body TEXT,
  old_status TEXT,
  new_status TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entity_events_entity_id_created_at_idx ON entity_events (entity_id, created_at);
CREATE INDEX entity_events_actor_user_id_idx ON entity_events (actor_user_id);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_user_id_idx ON api_keys (user_id);
CREATE UNIQUE INDEX api_keys_key_hash_uq ON api_keys (key_hash);
CREATE INDEX api_keys_active_lookup_idx ON api_keys (key_hash, revoked_at);

-- ============================================================
-- Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_epics_updated_at
  BEFORE UPDATE ON epics FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_review_queue_updated_at
  BEFORE UPDATE ON review_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Note: entity_events and api_keys have no updated_at column, so no trigger is needed.

-- ============================================================
-- Functions
-- ============================================================

CREATE OR REPLACE FUNCTION get_entity_lineage(
  p_entity_id UUID,
  p_direction TEXT DEFAULT 'both',
  p_max_depth INT DEFAULT 20,
  p_relationship_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  entity_id UUID,
  entity_type TEXT,
  entity_content TEXT,
  entity_status TEXT,
  relationship_type TEXT,
  relationship_direction TEXT,
  depth INT,
  path UUID[]
)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT
      er.source_id AS entity_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.source_id] AS path
    FROM entity_relationships er
    WHERE er.target_id = p_entity_id
      AND (p_direction IN ('ancestors', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    SELECT
      er.source_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT,
      a.depth + 1,
      a.path || er.source_id
    FROM entity_relationships er
    JOIN ancestors a ON er.target_id = a.entity_id
    WHERE a.depth < p_max_depth
      AND NOT (er.source_id = ANY(a.path))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  descendants AS (
    SELECT
      er.target_id AS entity_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.target_id] AS path
    FROM entity_relationships er
    WHERE er.source_id = p_entity_id
      AND (p_direction IN ('descendants', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    SELECT
      er.target_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT,
      d.depth + 1,
      d.path || er.target_id
    FROM entity_relationships er
    JOIN descendants d ON er.source_id = d.entity_id
    WHERE d.depth < p_max_depth
      AND NOT (er.target_id = ANY(d.path))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  combined AS (
    SELECT * FROM ancestors
    UNION ALL
    SELECT * FROM descendants
  )

  SELECT
    c.entity_id,
    e.type::TEXT AS entity_type,
    e.content AS entity_content,
    e.status AS entity_status,
    c.relationship_type,
    c.relationship_direction,
    c.depth,
    c.path
  FROM combined c
  JOIN entities e ON e.id = c.entity_id
  WHERE e.deleted_at IS NULL
  ORDER BY c.relationship_direction, c.depth, c.entity_id;
$$;
```

---

## Future Considerations

### 1. Vector Embeddings for Duplicate Detection

When the deduplication feature is implemented, add a vector column for embedding-based similarity search:

```sql
-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE entities ADD COLUMN embedding vector(1536);

-- HNSW index for approximate nearest-neighbor search
CREATE INDEX entities_embedding_idx ON entities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

The `1536` dimension matches OpenAI `text-embedding-3-small`. Adjust if using a different model. The HNSW index supports fast approximate nearest-neighbor queries with configurable recall/speed trade-offs.

### 2. Tag-Based Filtering Index

If "find all entities with tag X" becomes a frequent query pattern:

```sql
CREATE INDEX entity_tags_tag_id_idx ON entity_tags (tag_id);
```

### 3. JSONB Path Indexes

If the dashboard adds filters on JSONB attributes (e.g., filter tasks by priority):

```sql
-- GIN index for general JSONB containment queries
CREATE INDEX entities_attributes_gin_idx ON entities
  USING gin (attributes jsonb_path_ops);

-- Or targeted B-tree indexes for specific paths
CREATE INDEX entities_priority_idx ON entities ((attributes->>'priority'))
  WHERE type = 'task' AND deleted_at IS NULL;
```

### 4. Apache AGE Escape Hatch

If entity counts exceed 50K or traversal depths exceed 5 and recursive CTEs become slow:

```sql
CREATE EXTENSION IF NOT EXISTS age;
-- Then convert entity_relationships to an AGE graph and use Cypher queries
```

Per the design doc, this is the planned escape hatch -- no data migration needed.

### 5. Full-Text Search

If content search is needed beyond AI-powered matching:

```sql
ALTER TABLE entities ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX entities_content_tsv_idx ON entities USING gin (content_tsv);

-- Query:
-- SELECT * FROM entities WHERE content_tsv @@ to_tsquery('english', 'onboarding & redesign');
```

### 6. Audit Log Table

For compliance or debugging, consider an append-only audit log:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,  -- 'insert', 'update', 'delete'
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This can be populated via PostgreSQL triggers on the tables that matter most (entities, review_queue).

---

## ER Diagram (Text)

```
                                    ┌──────────────┐
                                    │    users     │
                                    │──────────────│
                                    │ id (PK)      │
                                    │ name         │
                                    │ email (UQ)   │
                                    │ avatar_url   │
                                    │ created_at   │
                                    │ updated_at   │
                                    └──────┬───────┘
                                           │
                    ┌──────────────────┬────┼────────┬──────────────────┐
                    │                  │    │        │                  │
                    ▼                  ▼    ▼        ▼                  ▼
             ┌──────────────┐  ┌───────────┐ ┌──────────────┐  ┌──────────────┐
             │  entities    │  │ raw_notes │ │ review_queue │  │  api_keys    │
             │  .assigneeId │  │.capturedBy│ │ .resolvedBy  │  │  .userId     │
             └──────────────┘  └───────────┘ └──────────────┘  └──────────────┘
                    │                                │
                    ▼                                │
             ┌──────────────┐                        │
             │entity_events │                        │
             │ .actorUserId │────────────────────────┘
             └──────────────┘        (also FK to users)


  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  projects    │────<│    epics     │     │    tags      │
  │──────────────│     │──────────────│     │──────────────│
  │ id (PK)      │     │ id (PK)      │     │ id (PK)      │
  │ name         │     │ name         │     │ name (UQ)    │
  │ description  │     │ description  │     │ created_at   │
  │ status       │     │ project_id   │──┐  └──────┬───────┘
  │ created_at   │     │ created_by   │  │         │
  │ updated_at   │     │ created_at   │  │         │ (entity_tags)
  │ deleted_at   │     │ updated_at   │  │         │
  └──────┬───────┘     │ deleted_at   │  │  ┌──────┴───────┐
         │             └──────────────┘  │  │ entity_tags  │
         │                               │  │──────────────│
         │  ┌────────────────────────────┘  │ entity_id    │───┐
         │  │                               │ tag_id       │   │
         ▼  ▼                               │ created_at   │   │
  ┌──────────────┐                          └──────────────┘   │
  │  entities    │◄────────────────────────────────────────────┘
  │──────────────│
  │ id (PK)      │     ┌──────────────────┐
  │ type         │     │ entity_sources   │
  │ content      │     │──────────────────│
  │ status       │◄────│ entity_id (PK)   │
  │ project_id   │──┐  │ raw_note_id (PK) │────┐
  │ epic_id      │──┘  │ created_at       │    │
  │ parent_task_id│──┐  └──────────────────┘    │
  │ assignee_id  │  │                           ▼
  │ confidence   │  │  ┌──────────────────┐  ┌──────────────┐
  │ attributes   │  │  │entity_relations  │  │  raw_notes   │
  │ ai_meta      │  │  │──────────────────│  │──────────────│
  │ evidence     │  │  │ source_id        │  │ id (PK)      │
  │ created_at   │  └─>│ target_id        │  │ content      │
  │ updated_at   │◄────│ relationship_type│  │ source       │
  │ deleted_at   │     │ metadata         │  │ external_id  │
  └──────┬───────┘     │ created_at       │  │ source_meta  │
         │             └──────────────────┘  │ captured_by  │
         │                                   │ captured_at  │
         ├──────────────────┐                │ processed    │
         ▼                  ▼                │ processed_at │
  ┌──────────────┐  ┌──────────────┐        │ proc_error   │
  │ review_queue │  │entity_events │        │ created_at   │
  │──────────────│  │──────────────│        └──────────────┘
  │ id (PK)      │  │ id (PK)      │
  │ entity_id    │  │ entity_id    │
  │ project_id   │  │ type         │
  │ review_type  │  │ actor_user_id│
  │ status       │  │ raw_note_id  │
  │ ai_suggestion│  │ body         │
  │ ai_confidence│  │ old_status   │
  │ resolved_by  │  │ new_status   │
  │ resolved_at  │  │ meta         │
  │ user_resoln  │  │ created_at   │
  │ training_cmt │  └──────────────┘
  │ created_at   │
  │ updated_at   │        ┌──────────────┐
  └──────────────┘        │  api_keys    │
                          │──────────────│
                          │ id (PK)      │
                          │ user_id      │
                          │ name         │
                          │ key_hash(UQ) │
                          │ last_used_at │
                          │ revoked_at   │
                          │ created_at   │
                          └──────────────┘
```

---

## Summary

| Table | Rows (estimated steady-state) | Key indexes |
|---|---|---|
| `users` | 10s | email (unique) |
| `projects` | 10s | status |
| `epics` | 100s | project_id |
| `entities` | 1000s-10000s | project+type+status (composite), active (partial), confidence |
| `raw_notes` | 1000s-10000s | unprocessed+captured_at (partial), source, captured_at, source+external_id (unique partial) |
| `entity_sources` | 1000s-10000s | composite PK, raw_note_id |
| `entity_relationships` | 1000s | source_id, target_id, source+type (composite), source+target+type (unique) |
| `tags` | 100s | name (unique) |
| `entity_tags` | 1000s | composite PK |
| `review_queue` | 100s (most resolved) | pending+created_at (partial), entity_id, project_id, entity_id+review_type (unique partial) |
| `entity_events` | 1000s-10000s | entity_id+created_at (composite), actor_user_id |
| `api_keys` | 10s-100s | user_id, key_hash (unique), key_hash+revoked_at (composite) |

Total estimated scale: low thousands. PostgreSQL handles this effortlessly. The indexes are designed for the specific query patterns described in the design doc, not for speculative optimization.
