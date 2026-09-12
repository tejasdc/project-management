// src/db/schema/users.ts

import { sqliteTable, uuid, text, timestamp } from "../columns";

export const users = sqliteTable("users", {
  id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
