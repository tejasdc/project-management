// src/db/schema/api-keys.ts

import { sqliteTable, uuid, text, timestamp, index, uniqueIndex } from "../columns";
import { users } from "./users";

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_key_hash_uq").on(table.keyHash),
    index("api_keys_active_lookup_idx").on(table.keyHash, table.revokedAt),
  ]
);
