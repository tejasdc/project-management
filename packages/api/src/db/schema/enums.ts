// src/db/schema/enums.ts

import { sqliteEnum } from "../columns";

/** The three core entity types. Fixed by design -- unlikely to change. */
export const entityTypeEnum = sqliteEnum("entity_type", [
  "task",
  "decision",
  "insight",
]);

/** How the raw note was captured. New sources added as integrations ship. */
export const noteSourceEnum = sqliteEnum("note_source", [
  "cli",
  "slack",
  "voice_memo",
  "meeting_transcript",
  "obsidian",
  "mcp",
  "api",
]);

/** Who created an epic. */
export const epicCreatorEnum = sqliteEnum("epic_creator", [
  "user",
  "ai_suggestion",
]);

/** Relationship types between entities (graph edges). */
export const relationshipTypeEnum = sqliteEnum("relationship_type", [
  "derived_from",
  "related_to",
  "promoted_to",
  "duplicate_of",
]);

/** What kind of review is needed. */
export const reviewTypeEnum = sqliteEnum("review_type", [
  "type_classification",
  "project_assignment",
  "epic_assignment",
  "epic_creation",
  "project_creation",
  "duplicate_detection",
  "low_confidence",
  "assignee_suggestion",
]);

/** Review resolution status. */
export const reviewStatusEnum = sqliteEnum("review_status", [
  "pending",
  "accepted",
  "rejected",
  "modified",
]);

/** Project status. */
export const projectStatusEnum = sqliteEnum("project_status", [
  "active",
  "archived",
]);

/** Event types for entity activity log. */
export const entityEventTypeEnum = sqliteEnum("entity_event_type", [
  "comment",
  "status_change",
  "reprocess",
]);
