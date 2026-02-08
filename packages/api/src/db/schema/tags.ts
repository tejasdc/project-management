// src/db/schema/tags.ts

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const tags = pgTable("tags", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
