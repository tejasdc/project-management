// src/db/schema/entity-relationships.ts

import { pgTable, uuid, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relationshipTypeEnum } from "./enums.js";
import { entities } from "./entities.js";
import type { RelationshipMeta } from "./types.js";

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
