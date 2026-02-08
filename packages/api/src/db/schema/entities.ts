// src/db/schema/entities.ts

import { pgTable, uuid, text, real, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { entityTypeEnum } from "./enums.js";
import { projects } from "./projects.js";
import { epics } from "./epics.js";
import { users } from "./users.js";
import type {
  TaskAttributes,
  DecisionAttributes,
  InsightAttributes,
  EntityAiMeta,
  EntityEvidence,
} from "./types.js";

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
