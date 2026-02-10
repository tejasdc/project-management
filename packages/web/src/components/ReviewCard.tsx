import { useState } from "react";

import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewType =
  | "type_classification"
  | "project_assignment"
  | "epic_assignment"
  | "epic_creation"
  | "project_creation"
  | "duplicate_detection"
  | "low_confidence"
  | "assignee_suggestion";

type EntityType = "task" | "decision" | "insight";

interface ReviewSuggestion {
  suggestedType?: EntityType;
  suggestedProjectId?: string;
  suggestedProjectName?: string;
  suggestedEpicId?: string;
  suggestedEpicName?: string;
  proposedEpicName?: string;
  proposedEpicDescription?: string | null;
  proposedEpicProjectId?: string;
  proposedProjectName?: string;
  proposedProjectDescription?: string | null;
  candidateEntityIds?: string[];
  duplicateEntityId?: string;
  duplicateCandidates?: Array<{ entityId: string; similarityScore: number; reason?: string }>;
  similarityScore?: number;
  suggestedAssigneeId?: string;
  suggestedAssigneeName?: string;
  explanation?: string;
  fieldKey?: string;
  suggestedValue?: unknown;
  [key: string]: unknown;
}

interface ReviewItem {
  id: string;
  entityId?: string | null;
  projectId?: string | null;
  reviewType: ReviewType;
  aiSuggestion: ReviewSuggestion;
  aiConfidence: number;
  createdAt: string;
}

interface Entity {
  id: string;
  type: EntityType;
  content: string;
  status: string;
  projectId?: string | null;
  epicId?: string | null;
  confidence: number;
  attributes?: Record<string, unknown>;
  aiMeta?: {
    fieldConfidence?: Record<string, { confidence: number; reason?: string }>;
    [key: string]: unknown;
  };
  evidence?: Array<{ rawNoteId: string; quote: string; permalink?: string }>;
}

interface ReviewCardProps {
  item: ReviewItem;
  entity?: Entity | null;
  disabled?: boolean;
  onResolve: (args: {
    status: "accepted" | "rejected" | "modified";
    userResolution?: Record<string, unknown>;
    trainingComment?: string;
  }) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<EntityType, string> = {
  task: "var(--accent-task)",
  decision: "var(--accent-decision)",
  insight: "var(--accent-insight)",
};

const ENTITY_BORDER_CLASSES: Record<EntityType, string> = {
  task: "border-t-[#F59E0B]",
  decision: "border-t-[#3B82F6]",
  insight: "border-t-[#10B981]",
};

const ENTITY_BADGE_CLASSES: Record<EntityType, string> = {
  task: "bg-[color-mix(in_oklab,var(--accent-task)_18%,transparent)] text-[#F59E0B]",
  decision: "bg-[color-mix(in_oklab,var(--accent-decision)_18%,transparent)] text-[#3B82F6]",
  insight: "bg-[color-mix(in_oklab,var(--accent-insight)_18%,transparent)] text-[#10B981]",
};

function prettyReviewType(t: string): string {
  if (t === "low_confidence") return "Needs Review";
  return t
    .split("_")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function confidenceColor(v: number): string {
  if (v >= 0.7) return "var(--confidence-high)";
  if (v >= 0.5) return "var(--confidence-medium)";
  return "var(--confidence-low)";
}

function confidenceBarBg(v: number): string {
  if (v >= 0.7) return "bg-[var(--confidence-high)]";
  if (v >= 0.5) return "bg-[var(--confidence-medium)]";
  return "bg-[var(--confidence-low)]";
}

function confidenceTextColor(v: number): string {
  if (v >= 0.7) return "text-[var(--confidence-high)]";
  if (v >= 0.5) return "text-[var(--confidence-medium)]";
  return "text-[var(--confidence-low)]";
}

/** Derive the entity type for border coloring. Prefers the entity type, falls back to suggestion. */
function resolveEntityType(entity?: Entity | null, suggestion?: ReviewSuggestion): EntityType {
  if (entity?.type) return entity.type;
  if (suggestion?.suggestedType) return suggestion.suggestedType;
  return "task";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Horizontal confidence bar with numeric label */
function ConfidenceBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(value, 1));
  const pct = Math.round(clamped * 100);
  return (
    <div className="flex items-center gap-2" title={`Confidence: ${pct}%`}>
      <div className="h-[4px] w-12 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
        <div
          className={`h-full rounded-full transition-all ${confidenceBarBg(clamped)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] font-semibold ${confidenceTextColor(clamped)}`}>
        {pct}%
      </span>
    </div>
  );
}

/** Colored badge for entity type */
function EntityTypeBadge({ type }: { type: EntityType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] ${ENTITY_BADGE_CLASSES[type]}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Human-readable AI suggestion formatter
// ---------------------------------------------------------------------------

function AiSuggestionText({
  reviewType,
  suggestion,
}: {
  reviewType: ReviewType;
  suggestion: ReviewSuggestion;
}) {
  switch (reviewType) {
    case "project_assignment":
      return (
        <span>
          AI suggests: Project{" "}
          <strong className="text-[var(--text-primary)]">
            &lsquo;{suggestion.suggestedProjectName || suggestion.suggestedProjectId || "Unknown"}&rsquo;
          </strong>
        </span>
      );

    case "epic_assignment":
      return (
        <span>
          AI suggests: Epic{" "}
          <strong className="text-[var(--text-primary)]">
            &lsquo;{suggestion.suggestedEpicName || suggestion.suggestedEpicId || "Unknown"}&rsquo;
          </strong>
        </span>
      );

    case "type_classification":
      return (
        <span>
          AI suggests:{" "}
          <strong className="text-[var(--text-primary)] capitalize">
            {suggestion.suggestedType ?? "Unknown"}
          </strong>
        </span>
      );

    case "duplicate_detection":
      return (
        <span>
          Possible duplicate of{" "}
          <strong className="text-[var(--text-primary)]">
            {suggestion.duplicateEntityId
              ? `entity ${suggestion.duplicateEntityId.slice(0, 8)}...`
              : "unknown entity"}
          </strong>
          {typeof suggestion.similarityScore === "number" && (
            <span className="ml-1 text-[var(--text-tertiary)]">
              ({Math.round(suggestion.similarityScore * 100)}% similar)
            </span>
          )}
        </span>
      );

    case "epic_creation":
      return (
        <span>
          Suggests creating epic:{" "}
          <strong className="text-[var(--text-primary)]">
            &lsquo;{suggestion.proposedEpicName || "Unnamed"}&rsquo;
          </strong>
        </span>
      );

    case "project_creation":
      return (
        <span>
          Suggests creating project:{" "}
          <strong className="text-[var(--text-primary)]">
            &lsquo;{suggestion.proposedProjectName || "Unnamed"}&rsquo;
          </strong>
        </span>
      );

    case "low_confidence":
      if (suggestion.fieldKey) {
        return (
          <span>
            Low confidence on field{" "}
            <strong className="text-[var(--text-primary)]">{suggestion.fieldKey}</strong>
            {suggestion.suggestedValue !== undefined && (
              <>
                {" "}
                (value:{" "}
                <span className="font-mono text-[var(--text-primary)]">
                  {String(suggestion.suggestedValue)}
                </span>
                )
              </>
            )}
          </span>
        );
      }
      return <span>Needs manual review</span>;

    case "assignee_suggestion":
      return (
        <span>
          AI suggests assigning to:{" "}
          <strong className="text-[var(--text-primary)]">
            {suggestion.suggestedAssigneeName || suggestion.suggestedAssigneeId || "Unknown"}
          </strong>
        </span>
      );

    default:
      return <span>{prettyReviewType(reviewType)}</span>;
  }
}

// ---------------------------------------------------------------------------
// Specialized card content sections
// ---------------------------------------------------------------------------

function DuplicateContent({ suggestion }: { suggestion: ReviewSuggestion }) {
  const score = suggestion.similarityScore;
  const pct = typeof score === "number" ? Math.round(score * 100) : null;

  return (
    <div className="mt-3 space-y-3">
      {/* Similarity score bar */}
      {pct !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Similarity
            </span>
            <span className={`font-mono text-xs font-semibold ${confidenceTextColor(score!)}`}>
              {pct}%
            </span>
          </div>
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
            <div
              className={`h-full rounded-full transition-all ${confidenceBarBg(score!)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Duplicate entity reference */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Potential Duplicate
        </div>
        <div className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
          {suggestion.duplicateEntityId ?? "Unknown ID"}
        </div>
      </div>
    </div>
  );
}

function EpicCreationContent({ suggestion }: { suggestion: ReviewSuggestion }) {
  return (
    <div className="mt-3 space-y-3">
      {/* Epic details */}
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Proposed Epic
        </div>
        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
          {suggestion.proposedEpicName ?? "Unnamed Epic"}
        </div>
        {suggestion.proposedEpicDescription && (
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {suggestion.proposedEpicDescription}
          </div>
        )}
      </div>

      {/* Candidate entities */}
      {suggestion.candidateEntityIds && suggestion.candidateEntityIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Entities to group ({suggestion.candidateEntityIds.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestion.candidateEntityIds.map((id) => (
              <span
                key={id}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]"
              >
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCreationContent({ suggestion }: { suggestion: ReviewSuggestion }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Proposed Project
        </div>
        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
          {suggestion.proposedProjectName ?? "Unnamed Project"}
        </div>
        {suggestion.proposedProjectDescription && (
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {suggestion.proposedProjectDescription}
          </div>
        )}
      </div>

      {suggestion.candidateEntityIds && suggestion.candidateEntityIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Related entities ({suggestion.candidateEntityIds.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestion.candidateEntityIds.map((id) => (
              <span
                key={id}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]"
              >
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LowConfidenceContent({
  entity,
  suggestion,
}: {
  entity?: Entity | null;
  suggestion: ReviewSuggestion;
}) {
  const fieldConfidence = entity?.aiMeta?.fieldConfidence;

  return (
    <div className="mt-3 space-y-3">
      {/* Source text excerpt */}
      {entity?.evidence && entity.evidence.length > 0 && (
        <blockquote className="border-l-2 border-[var(--border-medium)] pl-3 text-xs italic text-[var(--text-secondary)]">
          {entity.evidence[0]!.quote}
        </blockquote>
      )}

      {/* AI classification */}
      {entity?.type && (
        <div className="text-xs text-[var(--text-secondary)]">
          AI classified as:{" "}
          <span className="font-semibold capitalize text-[var(--text-primary)]">{entity.type}</span>
        </div>
      )}

      {/* Per-field confidence breakdown */}
      {fieldConfidence && Object.keys(fieldConfidence).length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Field Confidence
          </div>
          {Object.entries(fieldConfidence).map(([field, fc]) => (
            <div key={field} className="flex items-center gap-2">
              <span className="w-20 truncate text-[11px] text-[var(--text-secondary)]">{field}</span>
              <div className="h-[3px] w-12 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                  className={`h-full rounded-full ${confidenceBarBg(fc.confidence)}`}
                  style={{ width: `${Math.round(fc.confidence * 100)}%` }}
                />
              </div>
              <span className={`font-mono text-[10px] font-semibold ${confidenceTextColor(fc.confidence)}`}>
                {Math.round(fc.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modify panel (inline editing)
// ---------------------------------------------------------------------------

function ModifyPanel({
  item,
  onSubmit,
  onCancel,
}: {
  item: ReviewItem;
  onSubmit: (userResolution: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [altType, setAltType] = useState<string>(item.aiSuggestion.suggestedType ?? "task");
  const [altProjectId, setAltProjectId] = useState("");
  const [altEpicId, setAltEpicId] = useState("");
  const [altAssigneeId, setAltAssigneeId] = useState("");
  const [altDuplicateId, setAltDuplicateId] = useState("");
  const [altEpicName, setAltEpicName] = useState(item.aiSuggestion.proposedEpicName ?? "");
  const [altEpicDescription, setAltEpicDescription] = useState(item.aiSuggestion.proposedEpicDescription ?? "");
  const [altProjectName, setAltProjectName] = useState(item.aiSuggestion.proposedProjectName ?? "");
  const [altProjectDescription, setAltProjectDescription] = useState(item.aiSuggestion.proposedProjectDescription ?? "");
  const [altJson, setAltJson] = useState("");

  function handleSubmit() {
    let userResolution: Record<string, unknown> = {};

    switch (item.reviewType) {
      case "type_classification":
        userResolution = { suggestedType: altType };
        break;
      case "project_assignment":
        userResolution = { suggestedProjectId: altProjectId.trim() || null };
        break;
      case "epic_assignment":
        userResolution = { suggestedEpicId: altEpicId.trim() || null };
        break;
      case "assignee_suggestion":
        userResolution = { suggestedAssigneeId: altAssigneeId.trim() || null };
        break;
      case "duplicate_detection":
        userResolution = { duplicateEntityId: altDuplicateId.trim() };
        break;
      case "epic_creation":
        userResolution = {
          proposedEpicName: altEpicName.trim(),
          proposedEpicDescription: altEpicDescription.trim() || null,
        };
        break;
      case "project_creation":
        userResolution = {
          proposedProjectName: altProjectName.trim(),
          proposedProjectDescription: altProjectDescription.trim() || null,
        };
        break;
      case "low_confidence":
        if (altJson.trim()) {
          try {
            userResolution = JSON.parse(altJson);
          } catch {
            userResolution = { explanation: "Invalid JSON in modify payload" };
          }
        }
        break;
    }

    onSubmit(userResolution);
  }

  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        Modify
      </div>

      <div className="mt-3 space-y-2">
        {item.reviewType === "type_classification" && (
          <Select value={altType} onChange={(e) => setAltType(e.target.value)}>
            <option value="task">Task</option>
            <option value="decision">Decision</option>
            <option value="insight">Insight</option>
          </Select>
        )}

        {item.reviewType === "project_assignment" && (
          <Input
            value={altProjectId}
            onChange={(e) => setAltProjectId(e.target.value)}
            placeholder="Project ID (blank to clear)"
          />
        )}

        {item.reviewType === "epic_assignment" && (
          <Input
            value={altEpicId}
            onChange={(e) => setAltEpicId(e.target.value)}
            placeholder="Epic ID (blank to clear)"
          />
        )}

        {item.reviewType === "assignee_suggestion" && (
          <Input
            value={altAssigneeId}
            onChange={(e) => setAltAssigneeId(e.target.value)}
            placeholder="Assignee user ID (blank to clear)"
          />
        )}

        {item.reviewType === "duplicate_detection" && (
          <Input
            value={altDuplicateId}
            onChange={(e) => setAltDuplicateId(e.target.value)}
            placeholder="Duplicate entity ID"
          />
        )}

        {item.reviewType === "epic_creation" && (
          <>
            <Input value={altEpicName} onChange={(e) => setAltEpicName(e.target.value)} placeholder="Epic name" />
            <Input
              value={altEpicDescription}
              onChange={(e) => setAltEpicDescription(e.target.value)}
              placeholder="Epic description (optional)"
            />
          </>
        )}

        {item.reviewType === "project_creation" && (
          <>
            <Input value={altProjectName} onChange={(e) => setAltProjectName(e.target.value)} placeholder="Project name" />
            <Input
              value={altProjectDescription}
              onChange={(e) => setAltProjectDescription(e.target.value)}
              placeholder="Project description (optional)"
            />
          </>
        )}

        {item.reviewType === "low_confidence" && (
          <textarea
            value={altJson}
            onChange={(e) => setAltJson(e.target.value)}
            rows={4}
            placeholder='User resolution JSON (optional), e.g. {"explanation":"..."}'
            className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
          />
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={handleSubmit}>
          Submit
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action button rows (specialized per review type)
// ---------------------------------------------------------------------------

function StandardActions({
  onAccept,
  onReject,
  onModify,
  onToggleComment,
  isModifying,
  hasComment,
}: {
  onAccept: () => void;
  onReject: () => void;
  onModify: () => void;
  onToggleComment: () => void;
  isModifying: boolean;
  hasComment: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-accept)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-accept)_12%,transparent)] text-[var(--action-accept)] hover:bg-[color-mix(in_oklab,var(--action-accept)_20%,transparent)]"
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-modify)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-modify)_12%,transparent)] text-[var(--action-modify)] hover:bg-[color-mix(in_oklab,var(--action-modify)_20%,transparent)]"
          onClick={onModify}
        >
          {isModifying ? "Cancel Edit" : "Modify"}
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-reject)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-reject)_12%,transparent)] text-[var(--action-reject)] hover:bg-[color-mix(in_oklab,var(--action-reject)_20%,transparent)]"
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
      <button
        onClick={onToggleComment}
        className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        {hasComment ? "Hide comment" : "Comment"}
      </button>
    </div>
  );
}

function DuplicateActions({
  onKeepA,
  onKeepB,
  onNotDuplicate,
  onToggleComment,
  hasComment,
}: {
  onKeepA: () => void;
  onKeepB: () => void;
  onNotDuplicate: () => void;
  onToggleComment: () => void;
  hasComment: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-accept)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-accept)_12%,transparent)] text-[var(--action-accept)] hover:bg-[color-mix(in_oklab,var(--action-accept)_20%,transparent)]"
          onClick={onKeepA}
        >
          Merge (keep A)
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--accent-decision)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent-decision)_12%,transparent)] text-[var(--accent-decision)] hover:bg-[color-mix(in_oklab,var(--accent-decision)_20%,transparent)]"
          onClick={onKeepB}
        >
          Merge (keep B)
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-reject)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-reject)_12%,transparent)] text-[var(--action-reject)] hover:bg-[color-mix(in_oklab,var(--action-reject)_20%,transparent)]"
          onClick={onNotDuplicate}
        >
          Not Duplicates
        </Button>
      </div>
      <button
        onClick={onToggleComment}
        className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        {hasComment ? "Hide comment" : "Comment"}
      </button>
    </div>
  );
}

function CreationActions({
  label,
  onAccept,
  onModify,
  onReject,
  onToggleComment,
  isModifying,
  hasComment,
}: {
  label: string;
  onAccept: () => void;
  onModify: () => void;
  onReject: () => void;
  onToggleComment: () => void;
  isModifying: boolean;
  hasComment: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-accept)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-accept)_12%,transparent)] text-[var(--action-accept)] hover:bg-[color-mix(in_oklab,var(--action-accept)_20%,transparent)]"
          onClick={onAccept}
        >
          {label}
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-modify)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-modify)_12%,transparent)] text-[var(--action-modify)] hover:bg-[color-mix(in_oklab,var(--action-modify)_20%,transparent)]"
          onClick={onModify}
        >
          {isModifying ? "Cancel Edit" : "Edit"}
        </Button>
        <Button
          size="sm"
          className="border border-[color-mix(in_oklab,var(--action-reject)_30%,transparent)] bg-[color-mix(in_oklab,var(--action-reject)_12%,transparent)] text-[var(--action-reject)] hover:bg-[color-mix(in_oklab,var(--action-reject)_20%,transparent)]"
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
      <button
        onClick={onToggleComment}
        className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      >
        {hasComment ? "Hide comment" : "Comment"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReviewCard({ item, entity, disabled, onResolve }: ReviewCardProps) {
  const [showComment, setShowComment] = useState(false);
  const [trainingComment, setTrainingComment] = useState("");
  const [modifying, setModifying] = useState(false);

  const entityType = resolveEntityType(entity, item.aiSuggestion);
  const borderClass = ENTITY_BORDER_CLASSES[entityType];

  function handleResolve(status: "accepted" | "rejected" | "modified", userResolution?: Record<string, unknown>) {
    onResolve({
      status,
      userResolution,
      trainingComment: trainingComment || undefined,
    });
  }

  function toggleModify() {
    setModifying((v) => !v);
    if (!modifying) setShowComment(true);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      className={[
        "group rounded-[var(--radius-lg)] border-t-2 border border-[var(--border-subtle)]",
        "bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)]",
        "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        "transition-all duration-200",
        "hover:border-[var(--border-medium)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
        disabled ? "opacity-40 pointer-events-none scale-[0.98]" : "",
        borderClass,
      ].join(" ")}
    >
      {/* ---- Header row ---- */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <EntityTypeBadge type={entityType} />
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          {prettyReviewType(item.reviewType)}
        </span>
        <div className="ml-auto">
          <ConfidenceBar value={item.aiConfidence} />
        </div>
      </div>

      {/* ---- Content area ---- */}
      <div className="px-4 pb-3">
        {/* Entity title */}
        {entity && (
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {entity.content}
          </div>
        )}

        {/* Human-readable suggestion */}
        <div className="mt-2 text-xs text-[var(--text-secondary)]">
          <AiSuggestionText reviewType={item.reviewType} suggestion={item.aiSuggestion} />
        </div>

        {/* AI reasoning */}
        {item.aiSuggestion.explanation && (
          <div className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
            {item.aiSuggestion.explanation}
          </div>
        )}

        {/* Specialized content */}
        {item.reviewType === "duplicate_detection" && (
          <DuplicateContent suggestion={item.aiSuggestion} />
        )}
        {item.reviewType === "epic_creation" && (
          <EpicCreationContent suggestion={item.aiSuggestion} />
        )}
        {item.reviewType === "project_creation" && (
          <ProjectCreationContent suggestion={item.aiSuggestion} />
        )}
        {item.reviewType === "low_confidence" && (
          <LowConfidenceContent entity={entity} suggestion={item.aiSuggestion} />
        )}

        {/* Source context (evidence quote) */}
        {entity?.evidence &&
          entity.evidence.length > 0 &&
          item.reviewType !== "low_confidence" && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Source
              </div>
              <blockquote className="mt-1 border-l-2 border-[var(--border-medium)] pl-3 text-xs italic text-[var(--text-secondary)]">
                {entity.evidence[0]!.quote}
              </blockquote>
            </div>
          )}

        {/* Modify panel */}
        {modifying && item.reviewType !== "duplicate_detection" && (
          <ModifyPanel
            item={item}
            onSubmit={(userResolution) => handleResolve("modified", userResolution)}
            onCancel={() => setModifying(false)}
          />
        )}

        {/* Training comment */}
        {showComment && (
          <div className="mt-3">
            <textarea
              value={trainingComment}
              onChange={(e) => setTrainingComment(e.target.value)}
              rows={2}
              placeholder="Why is this wrong/right? (feeds DSPy later)"
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-medium)]"
            />
          </div>
        )}
      </div>

      {/* ---- Action buttons (horizontal row at bottom) ---- */}
      <div className="border-t border-[var(--border-subtle)] px-4 py-3">
        {item.reviewType === "duplicate_detection" ? (
          <DuplicateActions
            onKeepA={() => handleResolve("accepted")}
            onKeepB={() =>
              handleResolve("modified", {
                duplicateEntityId: item.aiSuggestion.duplicateEntityId,
                keepTarget: true,
              })
            }
            onNotDuplicate={() => handleResolve("rejected")}
            onToggleComment={() => setShowComment((v) => !v)}
            hasComment={showComment}
          />
        ) : item.reviewType === "epic_creation" ? (
          <CreationActions
            label="Create Epic"
            onAccept={() => handleResolve("accepted")}
            onModify={toggleModify}
            onReject={() => handleResolve("rejected")}
            onToggleComment={() => setShowComment((v) => !v)}
            isModifying={modifying}
            hasComment={showComment}
          />
        ) : item.reviewType === "project_creation" ? (
          <CreationActions
            label="Create Project"
            onAccept={() => handleResolve("accepted")}
            onModify={toggleModify}
            onReject={() => handleResolve("rejected")}
            onToggleComment={() => setShowComment((v) => !v)}
            isModifying={modifying}
            hasComment={showComment}
          />
        ) : (
          <StandardActions
            onAccept={() => handleResolve("accepted")}
            onReject={() => handleResolve("rejected")}
            onModify={toggleModify}
            onToggleComment={() => setShowComment((v) => !v)}
            isModifying={modifying}
            hasComment={showComment}
          />
        )}
      </div>
    </div>
  );
}
