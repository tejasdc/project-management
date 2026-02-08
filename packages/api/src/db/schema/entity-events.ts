// src/db/schema/entity-events.ts

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { entityEventTypeEnum } from "./enums.js";
import { entities } from "./entities.js";
import { users } from "./users.js";
import { rawNotes } from "./raw-notes.js";
import type { EntityEventMeta } from "./types.js";

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
