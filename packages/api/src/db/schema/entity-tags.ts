// src/db/schema/entity-tags.ts

import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { entities } from "./entities.js";
import { tags } from "./tags.js";

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
