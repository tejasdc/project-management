import { useState } from "react";

import { ConfidenceBadge } from "./ConfidenceBadge";

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
        </div>

        <div className="shrink-0 space-y-2">
          <button
            onClick={() => props.onResolve({ status: "accepted", trainingComment: trainingComment || undefined })}
            className="w-[110px] rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--action-accept)_22%,transparent)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--action-accept)_30%,transparent)]"
          >
            Accept
          </button>
          <button
            onClick={() => props.onResolve({ status: "rejected", trainingComment: trainingComment || undefined })}
            className="w-[110px] rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--action-reject)_18%,transparent)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--action-reject)_26%,transparent)]"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

