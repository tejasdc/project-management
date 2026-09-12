// src/db/schema/entity-sources.ts

import { sqliteTable, uuid, timestamp, primaryKey, index } from "../columns";
import { entities } from "./entities";
import { rawNotes } from "./raw-notes";

export const entitySources = sqliteTable(
  "entity_sources",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    rawNoteId: uuid("raw_note_id")
      .notNull()
      .references(() => rawNotes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.rawNoteId] }),
    // Reverse lookup: "which entities were extracted from this raw note?"
    index("entity_sources_raw_note_id_idx").on(table.rawNoteId),
  ]
);
