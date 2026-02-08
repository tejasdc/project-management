// src/db/schema/projects.ts

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { projectStatusEnum } from "./enums.js";

export const projects = pgTable(
  "projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    status: projectStatusEnum().notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_status_idx").on(table.status),
  ]
);
