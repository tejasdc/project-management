import { sqliteTable, text, integer, blob, primaryKey, index } from "drizzle-orm/sqlite-core";
import { rawNotes } from "./raw-notes";
export const notePages = sqliteTable("note_pages", {
  rawNoteId: text("raw_note_id").notNull().references(() => rawNotes.id, { onDelete: "cascade" }),
  page: integer().notNull(),
  bytes: blob({ mode: "buffer" }).notNull(),
}, t => [primaryKey({ columns: [t.rawNoteId, t.page] })]);
export const processingJobs = sqliteTable("processing_jobs", {
  rawNoteId: text("raw_note_id").primaryKey().references(() => rawNotes.id, { onDelete: "cascade" }),
  generation: text().notNull(),
  step: text({ enum: ["extract", "organize"] }).notNull(),
  status: text({ enum: ["pending", "done", "failed"] }).notNull().default("pending"),
  attempts: integer().notNull().default(0),
  nextAttempt: integer("next_attempt").notNull(),
  entityIds: text("entity_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  error: text(),
}, t => [index("processing_jobs_due").on(t.status, t.nextAttempt)]);
export const rateLimits = sqliteTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("rate_limits_expiration").on(t.expiresAt)]);
