// src/db/schema/epics.ts

import { enumCheck, sqliteTable, uuid, text, timestamp, index } from "../columns";
import { epicCreatorEnum } from "./enums";
import { projects } from "./projects";

export const epics = sqliteTable(
  "epics",
  {
    id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    description: text(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: epicCreatorEnum("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    enumCheck("epics_createdBy_values", table.createdBy),
    index("epics_project_id_idx").on(table.projectId),
  ]
);
