// src/db/schema/epics.ts

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { epicCreatorEnum } from "./enums.js";
import { projects } from "./projects.js";

export const epics = pgTable(
  "epics",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: epicCreatorEnum("created_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("epics_project_id_idx").on(table.projectId),
  ]
);
