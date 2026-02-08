import { Link } from "@tanstack/react-router";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { TypeBadge } from "./TypeBadge";

export function EntityRow(props: { entity: any; index?: number }) {
  const e = props.entity;
  const delayMs = (props.index ?? 0) * 25;

  return (
    <Link
      to="/entities/$entityId"
      params={{ entityId: e.id }}
      className="group block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-3 hover:border-[var(--border-medium)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="animate-in flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={e.type} />
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
              {e.status}
            </span>
          </div>
          <div className="mt-2 line-clamp-2 text-sm font-medium text-[var(--text-primary)]">
            {e.content}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <ConfidenceBadge value={e.confidence} />
          <div className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
            {String(e.id).slice(0, 8)}
          </div>
        </div>
      </div>
    </Link>
  );
}

