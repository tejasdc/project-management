import { useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/DropdownMenu";

interface ProjectCardProps {
  project: any;
  stats?: {
    tasksByStatus: Record<string, number>;
    openDecisions: number;
    recentInsights: number;
  };
  reviewCount?: number;
  index?: number;
  onEdit?: (project: any) => void;
  onArchive?: (project: any) => void;
  onDuplicate?: (project: any) => void;
}

function StatDot(props: { color: string }) {
  return (
    <span
      className="inline-block size-[6px] shrink-0 rounded-full"
      style={{ backgroundColor: props.color }}
    />
  );
}

function StatRow(props: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[2px]">
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
        <StatDot color={props.color} />
        {props.label}
      </span>
      <span className="font-[var(--font-mono)] text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
        {props.count}
      </span>
    </div>
  );
}

export function ProjectCard(props: ProjectCardProps) {
  const { project: p, stats, reviewCount = 0, index = 0 } = props;
  const delayMs = index * 35;

  const tasksByStatus = stats?.tasksByStatus ?? {};
  const captured = tasksByStatus["captured"] ?? 0;
  const needsAction = tasksByStatus["needs_action"] ?? 0;
  const inProgress = tasksByStatus["in_progress"] ?? 0;
  const done = tasksByStatus["done"] ?? 0;

  const pendingDecisions = stats?.openDecisions ?? 0;
  const decidedDecisions = tasksByStatus["decided"] ?? 0;

  const recentInsights = stats?.recentInsights ?? 0;

  const hasReviews = reviewCount > 0;
  const highReviews = reviewCount > 5;

  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return (
    <div
      className="animate-in group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-200 hover:-translate-y-[2px] hover:border-[var(--border-medium)] hover:bg-[color-mix(in_oklab,var(--bg-secondary)_96%,black)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.04)_inset]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* Left gradient edge */}
      <div
        className="absolute top-0 left-0 h-full w-[2px]"
        style={{
          background:
            "linear-gradient(to bottom, var(--accent-task), var(--accent-decision), var(--accent-insight))",
        }}
      />

      {/* Card body */}
      <div className="p-4 pl-[18px]">
        {/* Header: name + status pill + review badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-[var(--font-display)] text-[15px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
              {p.name}
            </div>
            <div className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
              {p.description || "No description."}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasReviews && (
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-bold",
                  highReviews
                    ? "animate-pulse bg-[color-mix(in_oklab,#ef4444_22%,transparent)] text-[#ef4444]"
                    : "bg-[color-mix(in_oklab,var(--accent-task)_22%,transparent)] text-[var(--accent-task)]",
                ].join(" ")}
              >
                {reviewCount} pending
              </span>
            )}
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
              {p.status}
            </span>
          </div>
        </div>

        {/* Unified stats panel */}
        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border-subtle)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
          {/* Tasks column */}
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              <StatDot color="var(--accent-task)" />
              Tasks
            </div>
            <div className="space-y-0.5">
              <StatRow color="#6b7189" label="Captured" count={captured} />
              <StatRow color="var(--accent-task)" label="Needs action" count={needsAction} />
              <StatRow color="var(--accent-decision)" label="In progress" count={inProgress} />
              <StatRow color="var(--accent-insight)" label="Done" count={done} />
            </div>
          </div>

          {/* Decisions column */}
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              <StatDot color="var(--accent-decision)" />
              Decisions
            </div>
            <div className="space-y-0.5">
              <StatRow color="var(--accent-task)" label="Pending" count={pendingDecisions} />
              <StatRow color="var(--accent-insight)" label="Decided" count={decidedDecisions} />
            </div>
          </div>

          {/* Insights column */}
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              <StatDot color="var(--accent-insight)" />
              Insights
            </div>
            <div className="space-y-0.5">
              <StatRow color="var(--accent-insight)" label="Total" count={recentInsights} />
            </div>
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2.5 pl-[18px]">
        <Link
          to="/projects/$projectId"
          params={{ projectId: p.id }}
          className="text-[13px] font-medium text-[var(--accent-decision)] transition-colors hover:text-[#60A5FA]"
        >
          View Project
          <span className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
            &rarr;
          </span>
        </Link>

        {/* Actions dropdown -- stop propagation so clicks don't bubble */}
        <div onClick={stopPropagation}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-quaternary)] hover:text-[var(--text-secondary)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <circle cx="3" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="13" cy="8" r="1.5" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => props.onEdit?.(p)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                </svg>
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onDuplicate?.(p)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="5" width="9" height="9" rx="1.5" />
                  <path d="M2 11V2.5A.5.5 0 012.5 2H11" />
                </svg>
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[var(--action-reject)] hover:text-[var(--action-reject)]"
                onSelect={() => props.onArchive?.(p)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="1" y="2" width="14" height="4" rx="1" />
                  <path d="M2 6v7a1 1 0 001 1h10a1 1 0 001-1V6" />
                  <path d="M6 9h4" />
                </svg>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
