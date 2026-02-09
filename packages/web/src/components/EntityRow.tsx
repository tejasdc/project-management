import { Link } from "@tanstack/react-router";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { TypeBadge } from "./TypeBadge";

/** Generates a deterministic color from a string (for avatar circles). */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `oklch(0.72 0.14 ${hue})`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function EntityRow(props: {
  entity: any;
  index?: number;
  assigneeName?: string | null;
}) {
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
        <div className="min-w-0 flex-1">
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
        <div className="flex shrink-0 items-center gap-3">
          {/* Assignee avatar */}
          {props.assigneeName ? (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: stringToColor(props.assigneeName) }}
              title={props.assigneeName}
            >
              {getInitials(props.assigneeName)}
            </div>
          ) : (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              Unassigned
            </span>
          )}
          <div className="text-right">
            <ConfidenceBadge value={e.confidence} />
            <div className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
              {String(e.id).slice(0, 8)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
