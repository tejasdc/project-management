// src/db/schema/review-queue.ts

import { pgTable, uuid, text, real, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { reviewTypeEnum, reviewStatusEnum } from "./enums.js";
import { entities } from "./entities.js";
import { projects } from "./projects.js";
import { users } from "./users.js";
import type { ReviewSuggestion } from "./types.js";

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .references(() => entities.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "set null" }),
    reviewType: reviewTypeEnum("review_type").notNull(),
    status: reviewStatusEnum().notNull().default("pending"),

    // What the AI suggested
    aiSuggestion: jsonb("ai_suggestion").$type<ReviewSuggestion>().notNull(),
    aiConfidence: real("ai_confidence").notNull(),

    // How the user resolved it
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    userResolution: jsonb("user_resolution").$type<ReviewSuggestion>(),

    // Training comment for DSPy feedback loop
    trainingComment: text("training_comment"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The review UI's primary query: "all pending review items, newest first"
    index("review_queue_pending_idx")
      .on(table.createdAt)
      .where(sql`status = 'pending'`),
    index("review_queue_entity_id_idx").on(table.entityId),
    index("review_queue_project_id_idx").on(table.projectId),
    index("review_queue_review_type_idx").on(table.reviewType),
    // For DSPy training data export: "all resolved items with training comments"
    index("review_queue_resolved_idx")
      .on(table.status, table.resolvedAt),
    // Prevent duplicate pending reviews for the same entity + review type
    uniqueIndex("review_queue_pending_unique_entity_review_type")
      .on(table.entityId, table.reviewType)
      .where(sql`status = 'pending' AND entity_id IS NOT NULL AND review_type <> 'low_confidence'`),
    // At least one of entity_id or project_id must be set
    check(
      "review_queue_entity_or_project",
      sql`(entity_id IS NOT NULL OR project_id IS NOT NULL)`
    ),
  ]
);
