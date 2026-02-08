import { Link } from "@tanstack/react-router";

export function ProjectCard(props: { project: any; stats?: any; index?: number }) {
  const p = props.project;
  const delayMs = (props.index ?? 0) * 35;

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: p.id }}
      className="group block rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-[var(--border-medium)] hover:bg-[color-mix(in_oklab,var(--bg-secondary)_96%,black)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="animate-in flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-[var(--font-display)] text-[15px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
            {p.name}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {p.description || "No description."}
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
          {p.status}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Tasks
          </div>
          <div className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {props.stats?.tasks ?? "—"}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Decisions
          </div>
          <div className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {props.stats?.openDecisions ?? "—"}
          </div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Insights
          </div>
          <div className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {props.stats?.recentInsights ?? "—"}
          </div>
        </div>
      </div>
    </Link>
  );
}

