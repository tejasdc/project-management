// src/db/schema/raw-notes.ts

import { enumCheck, sqliteTable, uuid, text, boolean, timestamp, jsonb, index, uniqueIndex } from "../columns";
import { sql } from "drizzle-orm";
import { noteSourceEnum } from "./enums";
import { users } from "./users";
import type { SourceMeta } from "./types";

export const rawNotes = sqliteTable(
  "raw_notes",
  {
    id: uuid().primaryKey().$defaultFn(() => crypto.randomUUID()),
    content: text().notNull(),
    source: noteSourceEnum().notNull(),
    externalId: text("external_id"),
    sourceMeta: jsonb("source_meta").$type<SourceMeta>(),
    capturedBy: uuid("captured_by").references(() => users.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    processed: boolean().notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    enumCheck("raw_notes_source_values", table.source),
    // The processing pipeline's primary query: "give me unprocessed notes ordered by capture time"
    index("raw_notes_unprocessed_captured_at_idx")
      .on(table.capturedAt, table.id)
      .where(sql`processed = false`),
    index("raw_notes_source_idx").on(table.source),
    index("raw_notes_captured_by_idx").on(table.capturedBy),
    index("raw_notes_captured_at_idx").on(table.capturedAt),
    // Deduplicate ingestion from the same source (e.g., same Slack message ID)
    uniqueIndex("raw_notes_source_external_id_uq")
      .on(table.source, table.externalId)
      .where(sql`external_id IS NOT NULL`),
  ]
);
