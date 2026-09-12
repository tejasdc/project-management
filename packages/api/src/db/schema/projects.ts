// src/db/schema/projects.ts

import { enumCheck, sqliteTable, uuid, text, timestamp, index } from "../columns";
import { projectStatusEnum } from "./enums";

export const projects = sqliteTable(
  "projects",
  {
    id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    description: text(),
    status: projectStatusEnum().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    enumCheck("projects_status_values", table.status),
    index("projects_status_idx").on(table.status),
  ]
);
