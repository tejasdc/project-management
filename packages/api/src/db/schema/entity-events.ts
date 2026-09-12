// src/db/schema/entity-events.ts

import { enumCheck, sqliteTable, uuid, text, timestamp, jsonb, index } from "../columns";
import { entityEventTypeEnum } from "./enums";
import { entities } from "./entities";
import { users } from "./users";
import { rawNotes } from "./raw-notes";
import type { EntityEventMeta } from "./types";

export const entityEvents = sqliteTable(
  "entity_events",
  {
    id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    enumCheck("entity_events_type_values", table.type),
    index("entity_events_entity_id_created_at_idx").on(table.entityId, table.createdAt),
    index("entity_events_actor_user_id_idx").on(table.actorUserId),
  ]
);
