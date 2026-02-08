import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { EntityRow } from "../components/EntityRow";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/projects/$projectId")({
  component: ProjectDashboardPage,
  errorComponent: RouteError,
});

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
  const navigate = useNavigate({ from: "/projects/$projectId" });
  // Use router state to re-render on search changes.
  useRouterState({ select: (s) => s.location.href });

  const sp = new URLSearchParams(window.location.search);
  const type = sp.get("type") || "";
  const status = sp.get("status") || "";
  const assigneeId = sp.get("assigneeId") || "";
  const epicId = sp.get("epicId") || "";

  const dash = useQuery({
    queryKey: qk.projectDashboard(String(projectId)),
    queryFn: async () => {
      const res = await api.api.projects[":id"].dashboard.$get({ param: { id: String(projectId) } as any, query: {} as any });
      return unwrapJson<any>(res);
    },
    enabled: Boolean(projectId),
  });

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.api.users.$get();
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 60_000,
  });

  const epicsQ = useQuery({
    queryKey: ["epics", String(projectId)],
    queryFn: async () => {
      const res = await api.api.epics.$get({ query: { projectId: String(projectId), limit: "100" } as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const entitiesQ = useQuery({
    queryKey: qk.entities({ projectId: String(projectId), type, status, assigneeId }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("projectId", String(projectId));
      params.set("limit", "100");
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      if (assigneeId) params.set("assigneeId", assigneeId);
      const res = await api.api.entities.$get({ query: Object.fromEntries(params.entries()) as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    enabled: Boolean(projectId),
  });

  if (dash.isLoading) return <div className="text-sm text-[var(--text-secondary)]">Loading…</div>;
  if (dash.isError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <div>{(dash.error as any)?.message ?? "Failed to load dashboard."}</div>
        <button
          onClick={() => dash.refetch()}
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
        >
          Retry
        </button>
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

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Type
            </div>
            <select
              value={type}
              onChange={(e) => {
                const next = new URLSearchParams(window.location.search);
                if (e.target.value) next.set("type", e.target.value);
                else next.delete("type");
                void navigate({ search: Object.fromEntries(next.entries()) as any });
              }}
              className="mt-2 h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
            >
              <option value="">All</option>
              <option value="task">Task</option>
              <option value="decision">Decision</option>
              <option value="insight">Insight</option>
            </select>
          </div>

          <div className="min-w-[220px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Status
            </div>
            <div className="mt-2">
              <Input
                value={status}
                placeholder="e.g. captured, in_progress"
                onChange={(e) => {
                  const next = new URLSearchParams(window.location.search);
                  const v = e.target.value.trim();
                  if (v) next.set("status", v);
                  else next.delete("status");
                  void navigate({ search: Object.fromEntries(next.entries()) as any });
                }}
              />
            </div>
          </div>

          <div className="min-w-[220px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Assignee
            </div>
            <select
              value={assigneeId}
              onChange={(e) => {
                const next = new URLSearchParams(window.location.search);
                if (e.target.value) next.set("assigneeId", e.target.value);
                else next.delete("assigneeId");
                void navigate({ search: Object.fromEntries(next.entries()) as any });
              }}
              className="mt-2 h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
            >
              <option value="">Anyone</option>
              {(usersQ.data?.items ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[240px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Epic
            </div>
            <select
              value={epicId}
              onChange={(e) => {
                const next = new URLSearchParams(window.location.search);
                if (e.target.value) next.set("epicId", e.target.value);
                else next.delete("epicId");
                void navigate({ search: Object.fromEntries(next.entries()) as any });
              }}
              className="mt-2 h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
            >
              <option value="">All epics</option>
              {(epicsQ.data?.items ?? []).map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>
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

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
              Entities
            </div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              Filterable list. Ungrouped items are called out separately.
            </div>
          </div>
          <Badge variant="muted">{(entitiesQ.data?.items ?? []).length} shown</Badge>
        </div>

        {entitiesQ.isLoading ? (
          <div className="mt-4 text-sm text-[var(--text-secondary)]">Loading…</div>
        ) : entitiesQ.isError ? (
          <div className="mt-4 text-sm text-[var(--text-secondary)]">
            <div>{(entitiesQ.error as any)?.message ?? "Failed to load entities."}</div>
            <button
              onClick={() => entitiesQ.refetch()}
              className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
            >
              Retry
            </button>
          </div>
        ) : (
          (() => {
            const all = (entitiesQ.data?.items ?? []) as any[];
            const epicFilter = epicId || null;
            const filtered = epicFilter ? all.filter((e) => e.epicId === epicFilter) : all;
            const ungrouped = filtered.filter((e) => !e.epicId);
            const grouped = new Map<string, any[]>();
            for (const e of filtered) {
              if (!e.epicId) continue;
              const arr = grouped.get(e.epicId) ?? [];
              arr.push(e);
              grouped.set(e.epicId, arr);
            }
            const epicNameById = new Map((epicsQ.data?.items ?? []).map((e: any) => [e.id, e.name] as const));

            return (
              <div className="mt-4 space-y-6">
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">Ungrouped entities</div>
                    <Badge variant="muted">{ungrouped.length}</Badge>
                  </div>
                  {ungrouped.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">None.</div>
                  ) : (
                    <div className="space-y-2">
                      {ungrouped.map((e, i) => (
                        <EntityRow key={e.id} entity={e} index={i} />
                      ))}
                    </div>
                  )}
                </section>

                {Array.from(grouped.entries()).map(([eid, items]) => (
                  <section key={eid} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{epicNameById.get(eid) ?? `Epic ${eid.slice(0, 8)}`}</div>
                      <Badge variant="muted">{items.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {items.map((e, i) => (
                        <EntityRow key={e.id} entity={e} index={i} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
