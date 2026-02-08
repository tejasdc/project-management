// src/db/schema/entity-sources.ts

import { pgTable, uuid, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { entities } from "./entities.js";
import { rawNotes } from "./raw-notes.js";

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
