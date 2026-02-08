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
  category?: TaskCategory;
  owner?: string;
  priority?: Priority;
  complexity?: Complexity;
  [key: string]: unknown;
}

export interface DecisionAttributes {
  options?: string[];
  chosen?: string | null;
  rationale?: string;
  decidedBy?: string;
  [key: string]: unknown;
}

export interface InsightAttributes {
  sentiment?: string;
  dataPoints?: string[];
  feasibility?: string;
  [key: string]: unknown;
}

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
  reason?: string;
  confidence?: number;
  createdBy?: "ai" | "user";
  [key: string]: unknown;
}

// ============================================================
// Review Queue Suggestion (the `ai_suggestion` and `user_resolution` JSONB)
// ============================================================

export interface ReviewSuggestion {
  suggestedType?: "task" | "decision" | "insight";
  suggestedProjectId?: string;
  suggestedProjectName?: string;
  suggestedEpicId?: string;
  suggestedEpicName?: string;
  proposedEpicName?: string;
  proposedEpicDescription?: string | null;
  proposedEpicProjectId?: string;
  duplicateEntityId?: string;
  similarityScore?: number;
  suggestedAssigneeId?: string;
  suggestedAssigneeName?: string;
  explanation?: string;
  [key: string]: unknown;
}
