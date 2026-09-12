// src/db/schema/tags.ts

import { sqliteTable, uuid, text, timestamp } from "../columns";

export const tags = sqliteTable("tags", {
  id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
});
