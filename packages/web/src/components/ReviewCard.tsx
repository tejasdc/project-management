import { useState } from "react";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

function prettyReviewType(t: string) {
  return t
    .split("_")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

export function ReviewCard(props: {
  item: any;
  entity?: any | null;
  onResolve: (args: { status: "accepted" | "rejected" | "modified"; userResolution?: any; trainingComment?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [trainingComment, setTrainingComment] = useState("");
  const [modifying, setModifying] = useState(false);

  const [altType, setAltType] = useState("task");
  const [altProjectId, setAltProjectId] = useState("");
  const [altEpicId, setAltEpicId] = useState("");
  const [altAssigneeId, setAltAssigneeId] = useState("");
  const [altDuplicateId, setAltDuplicateId] = useState("");
  const [altEpicName, setAltEpicName] = useState("");
  const [altEpicDescription, setAltEpicDescription] = useState("");
  const [altJson, setAltJson] = useState("");

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {prettyReviewType(props.item.reviewType)}
            </span>
            <ConfidenceBadge value={props.item.aiConfidence} />
          </div>

          {props.entity ? (
            <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
              {props.entity.content}
            </div>
          ) : null}

          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              AI suggestion
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--text-secondary)]">
              {JSON.stringify(props.item.aiSuggestion, null, 2)}
            </pre>
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            {expanded ? "Hide" : "Add"} training comment
          </button>

          {expanded ? (
            <div className="mt-2">
              <textarea
                value={trainingComment}
                onChange={(e) => setTrainingComment(e.target.value)}
                rows={3}
                placeholder="Why is this wrong/right? (feeds DSPy later)"
                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
              />
            </div>
          ) : null}

          {modifying ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Modify
              </div>

              <div className="mt-3 space-y-2">
                {props.item.reviewType === "type_classification" ? (
                  <select
                    value={altType}
                    onChange={(e) => setAltType(e.target.value)}
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
                  >
                    <option value="task">task</option>
                    <option value="decision">decision</option>
                    <option value="insight">insight</option>
                  </select>
                ) : null}

                {props.item.reviewType === "project_assignment" ? (
                  <Input
                    value={altProjectId}
                    onChange={(e) => setAltProjectId(e.target.value)}
                    placeholder="Project ID (blank to clear)"
                  />
                ) : null}

                {props.item.reviewType === "epic_assignment" ? (
                  <Input
                    value={altEpicId}
                    onChange={(e) => setAltEpicId(e.target.value)}
                    placeholder="Epic ID (blank to clear)"
                  />
                ) : null}

                {props.item.reviewType === "assignee_suggestion" ? (
                  <Input
                    value={altAssigneeId}
                    onChange={(e) => setAltAssigneeId(e.target.value)}
                    placeholder="Assignee user ID (blank to clear)"
                  />
                ) : null}

                {props.item.reviewType === "duplicate_detection" ? (
                  <Input
                    value={altDuplicateId}
                    onChange={(e) => setAltDuplicateId(e.target.value)}
                    placeholder="Duplicate entity ID"
                  />
                ) : null}

                {props.item.reviewType === "epic_creation" ? (
                  <>
                    <Input value={altEpicName} onChange={(e) => setAltEpicName(e.target.value)} placeholder="Epic name" />
                    <Input
                      value={altEpicDescription}
                      onChange={(e) => setAltEpicDescription(e.target.value)}
                      placeholder="Epic description (optional)"
                    />
                  </>
                ) : null}

                {props.item.reviewType === "low_confidence" ? (
                  <textarea
                    value={altJson}
                    onChange={(e) => setAltJson(e.target.value)}
                    rows={4}
                    placeholder='User resolution JSON (optional), e.g. {"explanation":"..."}'
                    className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
                  />
                ) : null}
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    let userResolution: any = {};
                    if (props.item.reviewType === "type_classification") userResolution = { suggestedType: altType };
                    else if (props.item.reviewType === "project_assignment") userResolution = { suggestedProjectId: altProjectId.trim() || null };
                    else if (props.item.reviewType === "epic_assignment") userResolution = { suggestedEpicId: altEpicId.trim() || null };
                    else if (props.item.reviewType === "assignee_suggestion") userResolution = { suggestedAssigneeId: altAssigneeId.trim() || null };
                    else if (props.item.reviewType === "duplicate_detection") userResolution = { duplicateEntityId: altDuplicateId.trim() };
                    else if (props.item.reviewType === "epic_creation")
                      userResolution = { proposedEpicName: altEpicName.trim(), proposedEpicDescription: altEpicDescription.trim() || null };
                    else if (props.item.reviewType === "low_confidence") {
                      if (altJson.trim()) {
                        try {
                          userResolution = JSON.parse(altJson);
                        } catch {
                          userResolution = { explanation: "Invalid JSON in modify payload" };
                        }
                      } else {
                        userResolution = {};
                      }
                    }
                    props.onResolve({ status: "modified", userResolution, trainingComment: trainingComment || undefined });
                  }}
                >
                  Submit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setModifying(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2">
          <Button
            onClick={() => props.onResolve({ status: "accepted", trainingComment: trainingComment || undefined })}
            className="w-[110px]"
            size="md"
          >
            Accept
          </Button>
          <Button
            onClick={() => props.onResolve({ status: "rejected", trainingComment: trainingComment || undefined })}
            className="w-[110px]"
            size="md"
            variant="danger"
          >
            Reject
          </Button>
          <Button
            onClick={() => {
              setModifying((v) => !v);
              setExpanded(true);
            }}
            className="w-[110px]"
            size="md"
            variant="secondary"
          >
            Modify
          </Button>
        </div>
      </div>
    </div>
  );
}
