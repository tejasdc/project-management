// src/db/schema/raw-notes.ts

import { pgTable, uuid, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noteSourceEnum } from "./enums.js";
import { users } from "./users.js";
import type { SourceMeta } from "./types.js";

export const rawNotes = pgTable(
  "raw_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    content: text().notNull(),
    source: noteSourceEnum().notNull(),
    externalId: text("external_id"),
    sourceMeta: jsonb("source_meta").$type<SourceMeta>(),
    capturedBy: uuid("captured_by").references(() => users.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    processed: boolean().notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
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
