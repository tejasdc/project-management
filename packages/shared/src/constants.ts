export const ENTITY_TYPES = ["task", "decision", "insight"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_STATUSES = {
  task: ["captured", "needs_action", "in_progress", "done"] as const,
  decision: ["pending", "decided"] as const,
  insight: ["captured", "acknowledged"] as const,
} as const;

export type TaskStatus = (typeof ENTITY_STATUSES.task)[number];
export type DecisionStatus = (typeof ENTITY_STATUSES.decision)[number];
export type InsightStatus = (typeof ENTITY_STATUSES.insight)[number];

export const NOTE_SOURCES = [
  "cli",
  "slack",
  "voice_memo",
  "meeting_transcript",
  "obsidian",
  "mcp",
  "api",
] as const;
export type NoteSource = (typeof NOTE_SOURCES)[number];

export const REVIEW_TYPES = [
  "type_classification",
  "project_assignment",
  "epic_assignment",
  "epic_creation",
  "project_creation",
  "duplicate_detection",
  "low_confidence",
  "assignee_suggestion",
] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

export const REVIEW_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "modified",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CONFIDENCE_THRESHOLD = 0.9;
