// Re-export shared JSONB types to keep schema imports stable.
// The source of truth lives in @pm/shared.

export type {
  TaskCategory,
  Priority,
  Complexity,
  TaskAttributes,
  DecisionAttributes,
  InsightAttributes,
  EntityAttributes,
  EntityEvidence,
  FieldConfidence,
  EntityAiMeta,
  EntityEventMeta,
  SlackSourceMeta,
  VoiceMemoSourceMeta,
  MeetingTranscriptSourceMeta,
  ObsidianSourceMeta,
  CliSourceMeta,
  SourceMeta,
  RelationshipMeta,
  ReviewSuggestion,
} from "@pm/shared";

