import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { EntityRow } from "../components/EntityRow";

function StatCard(props: { label: string; value: string | number; tone?: "task" | "decision" | "insight" }) {
  const tone =
    props.tone === "task"
      ? "var(--accent-task)"
      : props.tone === "decision"
      ? "var(--accent-decision)"
      : props.tone === "insight"
      ? "var(--accent-insight)"
      : "var(--text-tertiary)";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {props.label}
      </div>
      <div className="mt-2 font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]" style={{ color: tone }}>
        {props.value}
      </div>
    </div>
  );
}

export function ProjectDashboardPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });

  const dash = useQuery({
    queryKey: qk.projectDashboard(String(projectId)),
    queryFn: async () => {
      const res = await api.api.projects[String(projectId)].dashboard.$get();
      return unwrapJson<any>(res);
    },
    enabled: Boolean(projectId),
  });

  if (dash.isLoading) return <div className="text-sm text-[var(--text-secondary)]">Loading…</div>;
  if (dash.isError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        {(dash.error as any)?.message ?? "Failed to load dashboard."}
      </div>
    );
  }

  const data = dash.data;
  const project = data?.project;
  const stats = data?.stats ?? {};
  const taskStates = Object.values((stats as any).tasksByStatus ?? {}).reduce(
    (a: number, b: unknown) => a + Number((b as any) ?? 0),
    0
  );

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          {project?.name ?? "Project"}
        </div>
        <div className="mt-1 max-w-[80ch] text-sm text-[var(--text-secondary)]">
          {project?.description || "No description."}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total entities" value={stats.totalEntities ?? "—"} />
        <StatCard label="Open decisions" value={stats.openDecisions ?? "—"} tone="decision" />
        <StatCard label="Recent insights" value={stats.recentInsights ?? "—"} tone="insight" />
        <StatCard label="Task states" value={taskStates} tone="task" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
                Epics
              </div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                Computed progress from child tasks.
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {(data?.epics ?? []).length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No epics yet.</div>
            ) : (
              (data.epics ?? []).map((e: any, i: number) => {
                const pct = Math.round((e.progress?.percent ?? 0) * 100);
                return (
                  <div
                    key={e.epic.id}
                    className="animate-in rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {e.epic.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                          {e.epic.description || "—"}
                        </div>
                      </div>
                      <div className="shrink-0 font-mono text-[11px] text-[var(--text-tertiary)]">
                        {pct}%
                      </div>
                    </div>
                    <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--border-subtle)_60%,black)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-task),var(--accent-decision))]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {e.progress?.doneTasks ?? 0}/{e.progress?.totalTasks ?? 0} done
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Recent entities
          </div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            A feed of what the system just learned.
          </div>

          <div className="mt-4 space-y-3">
            {(data?.recentEntities ?? []).map((e: any, i: number) => (
              <EntityRow key={e.id} entity={e} index={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
