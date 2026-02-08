// src/db/schema/types.ts

// ============================================================
// Entity Attributes (the `attributes` JSONB on entities table)
// ============================================================

export type TaskCategory =
  | "feature"
  | "bug_fix"
  | "improvement"
  | "chore"
  | "refactor"
  | "story";

export type Priority = "critical" | "high" | "medium" | "low";

export type Complexity = "small" | "medium" | "large";

export interface TaskAttributes {
  /** What kind of task: feature, bug fix, refactor, etc. */
  category?: TaskCategory;
  /**
   * Raw owner/assignee string extracted by AI (e.g., "Sarah").
   * The application layer resolves this to `entities.assignee_id`.
   * Preserved here for audit and for cases where no matching user exists.
   */
  owner?: string;
  /** AI-suggested or user-set priority. */
  priority?: Priority;
  /** Rough size estimate. */
  complexity?: Complexity;
  /** Free-form key-value pairs for extensibility. */
  [key: string]: unknown;
}

export interface DecisionAttributes {
  /** Available options considered. */
  options?: string[];
  /** The chosen option (null if still pending). */
  chosen?: string | null;
  /** Why this option was chosen. */
  rationale?: string;
  /** Who made the decision (name string from extraction). */
  decidedBy?: string;
  [key: string]: unknown;
}

export interface InsightAttributes {
  /** Positive, negative, neutral, mixed. */
  sentiment?: string;
  /** Supporting data points or evidence. */
  dataPoints?: string[];
  /** How feasible is acting on this insight. */
  feasibility?: string;
  [key: string]: unknown;
}

/** Union type for the attributes column. Discriminate on `entities.type`. */
export type EntityAttributes =
  | TaskAttributes
  | DecisionAttributes
  | InsightAttributes;

// ============================================================
// Entity Evidence (the `evidence` JSONB on entities table)
// ============================================================

export interface EntityEvidence {
  rawNoteId: string;
  quote: string;
  startOffset?: number;
  endOffset?: number;
  permalink?: string;
}

// ============================================================
// Entity AI Metadata (the `ai_meta` JSONB on entities table)
// ============================================================

export interface FieldConfidence {
  confidence: number;
  reason?: string;
  evidence?: EntityEvidence[];
}

export interface EntityAiMeta {
  model?: string;
  promptVersion?: string;
  extractionRunId?: string;
  fieldConfidence?: Record<string, FieldConfidence>;
  [key: string]: unknown;
}

// ============================================================
// Entity Event Metadata (the `meta` JSONB on entity_events table)
// ============================================================

export interface EntityEventMeta {
  jobId?: string;
  model?: string;
  promptVersion?: string;
  reason?: string;
  [key: string]: unknown;
}

// ============================================================
// Source Meta (the `source_meta` JSONB on raw_notes table)
// ============================================================

export interface SlackSourceMeta {
  channelId: string;
  channelName?: string;
  messageTs: string;
  threadTs?: string;
  userId?: string;
  permalink?: string;
}

export interface VoiceMemoSourceMeta {
  durationSeconds?: number;
  transcriptionModel?: string;
  transcriptionConfidence?: number;
  originalFileUrl?: string;
}

export interface MeetingTranscriptSourceMeta {
  meetingId?: string;
  meetingTitle?: string;
  platform?: "fireflies" | "google_meet" | "zoom";
  participants?: string[];
  durationMinutes?: number;
  /** Pre-extracted items from Fireflies.ai, if available. */
  preExtractedItems?: {
    actionItems?: string[];
    decisions?: string[];
    questions?: string[];
  };
}

export interface ObsidianSourceMeta {
  filePath?: string;
  vaultName?: string;
}

export interface CliSourceMeta {
  workingDirectory?: string;
  gitBranch?: string;
}

/** Union type for source_meta. Discriminate on `raw_notes.source`. */
export type SourceMeta =
  | SlackSourceMeta
  | VoiceMemoSourceMeta
  | MeetingTranscriptSourceMeta
  | ObsidianSourceMeta
  | CliSourceMeta
  | Record<string, unknown>;

// ============================================================
// Relationship Metadata (the `metadata` JSONB on entity_relationships)
// ============================================================

export interface RelationshipMeta {
  /** Why this relationship was created. */
  reason?: string;
  /** AI confidence in this relationship. */
  confidence?: number;
  /** Who or what created this relationship. */
  createdBy?: "ai" | "user";
  [key: string]: unknown;
}

// ============================================================
// Review Queue Suggestion (the `ai_suggestion` and `user_resolution` JSONB)
// ============================================================

export interface ReviewSuggestion {
  /** For type_classification: the suggested entity type. */
  suggestedType?: "task" | "decision" | "insight";
  /** For project_assignment: the suggested project ID. */
  suggestedProjectId?: string;
  /** For project_assignment: the suggested project name (for display). */
  suggestedProjectName?: string;
  /** For epic_assignment: the suggested epic ID. */
  suggestedEpicId?: string;
  /** For epic_assignment: the suggested epic name (for display). */
  suggestedEpicName?: string;
  /** For epic_creation: the proposed name for the new epic. */
  proposedEpicName?: string;
  /** For epic_creation: the proposed description for the new epic. */
  proposedEpicDescription?: string | null;
  /** For epic_creation: the project the new epic should belong to. */
  proposedEpicProjectId?: string;
  /** For duplicate_detection: the ID of the suspected duplicate entity. */
  duplicateEntityId?: string;
  /** For duplicate_detection: similarity score. */
  similarityScore?: number;
  /** For assignee_suggestion: the suggested user ID. */
  suggestedAssigneeId?: string;
  /** For assignee_suggestion: the raw name string from extraction. */
  suggestedAssigneeName?: string;
  /** Human-readable explanation of why this was suggested. */
  explanation?: string;
  [key: string]: unknown;
}
