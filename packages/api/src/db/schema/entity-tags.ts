// src/db/schema/entity-tags.ts

import { sqliteTable, uuid, timestamp, primaryKey } from "../columns";
import { entities } from "./entities";
import { tags } from "./tags";

export const entityTags = sqliteTable(
  "entity_tags",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.tagId] }),
  ]
);
