import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { EntityRow } from "../components/EntityRow";
import { TypeBadge } from "../components/TypeBadge";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/projects/$projectId")({
  component: ProjectDashboardPage,
  errorComponent: RouteError,
});

/* ---------- Stat strip item ---------- */

function StatItem(props: {
  label: string;
  value: string | number;
  tone?: "task" | "decision" | "insight" | "review";
}) {
  const toneColor =
    props.tone === "task"
      ? "var(--accent-task)"
      : props.tone === "decision"
      ? "var(--accent-decision)"
      : props.tone === "insight"
      ? "var(--accent-insight)"
      : props.tone === "review"
      ? "var(--action-modify)"
      : "var(--text-tertiary)";

  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3">
      <div
        className="font-[var(--font-display)] text-[20px] font-extrabold tracking-[-0.03em]"
        style={{ color: toneColor }}
      >
        {props.value}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {props.label}
      </div>
    </div>
  );
}

/* ---------- Entity type tab ---------- */

type EntityTab = "" | "task" | "decision" | "insight";

function TabButton(props: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  tone?: "task" | "decision" | "insight";
}) {
  const activeBorder = props.active
    ? props.tone === "task"
      ? "border-b-[var(--accent-task)] text-[var(--accent-task)]"
      : props.tone === "decision"
      ? "border-b-[var(--accent-decision)] text-[var(--accent-decision)]"
      : props.tone === "insight"
      ? "border-b-[var(--accent-insight)] text-[var(--accent-insight)]"
      : "border-b-[var(--text-primary)] text-[var(--text-primary)]"
    : "border-b-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]";

  return (
    <button
      onClick={props.onClick}
      className={[
        "inline-flex items-center gap-1.5 border-b-2 px-1 pb-2 text-xs font-semibold uppercase tracking-[0.1em] transition-colors",
        activeBorder,
      ].join(" ")}
    >
      {props.label}
      {typeof props.count === "number" && (
        <span className="rounded-full bg-[var(--bg-tertiary)] px-1.5 py-[1px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
          {props.count}
        </span>
      )}
    </button>
  );
}

/* ---------- Relative time helper ---------- */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ---------- Main page component ---------- */

export function ProjectDashboardPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const locationHref = useRouterState({ select: (s) => s.location.href });

  const sp = new URLSearchParams(new URL(locationHref, "http://x").search);
  const type = (sp.get("type") || "") as EntityTab;
  const status = sp.get("status") || "";
  const assigneeId = sp.get("assigneeId") || "";
  const epicId = sp.get("epicId") || "";

  // Collapsed state for epics section
  const [epicsCollapsed, setEpicsCollapsed] = useState(false);

  /* ---- Queries ---- */

  const dash = useQuery({
    queryKey: qk.projectDashboard(String(projectId)),
    queryFn: async () => {
      const res = await api.api.projects[":id"].dashboard.$get({
        param: { id: String(projectId) } as any,
        query: {} as any,
      });
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
      const res = await api.api.epics.$get({
        query: { projectId: String(projectId), limit: "100" } as any,
      });
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
      const res = await api.api.entities.$get({
        query: Object.fromEntries(params.entries()) as any,
      });
      return unwrapJson<{ items: any[] }>(res);
    },
    enabled: Boolean(projectId),
  });

  const pendingReviewsQ = useQuery({
    queryKey: qk.reviewQueueCount({ projectId: String(projectId), status: "pending" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].count.$get({
        query: { projectId: String(projectId), status: "pending" } as any,
      });
      return unwrapJson<{ count: number }>(res);
    },
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });

  /* ---- Loading / error states ---- */

  if (dash.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--border-medium)] border-t-transparent" />
        Loading project...
      </div>
    );
  }

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
  const totalTasks = Object.values((stats as any).tasksByStatus ?? {}).reduce(
    (a: number, b: unknown) => a + Number((b as any) ?? 0),
    0,
  ) as number;

  /* ---- Helpers for entity counts by type (from dashboard recentEntities + entities query) ---- */
  const allEntities = (entitiesQ.data?.items ?? []) as any[];
  const taskCount = allEntities.filter((e) => e.type === "task").length;
  const decisionCount = allEntities.filter((e) => e.type === "decision").length;
  const insightCount = allEntities.filter((e) => e.type === "insight").length;

  /* ---- Filter navigation helper ---- */
  function setSearchParam(key: string, value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    void navigate({ search: Object.fromEntries(next.entries()) as any });
  }

  /* ---- Entity list filtering by epic ---- */
  const epicFilter = epicId || null;
  const filteredEntities = epicFilter
    ? allEntities.filter((e) => e.epicId === epicFilter)
    : allEntities;
  const ungrouped = epicFilter ? [] : filteredEntities.filter((e) => !e.epicId);
  const grouped = new Map<string, any[]>();
  for (const e of filteredEntities) {
    if (!e.epicId) continue;
    const arr = grouped.get(e.epicId) ?? [];
    arr.push(e);
    grouped.set(e.epicId, arr);
  }
  const epicNameById = new Map(
    (epicsQ.data?.items ?? []).map((e: any) => [e.id, e.name] as const),
  );

  return (
    <div className="space-y-6">
      {/* ============================================================
          1. PROJECT HEADER
          ============================================================ */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
                {project?.name ?? "Project"}
              </h1>
              <span
                className={[
                  "rounded-full border px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.14em]",
                  project?.status === "active"
                    ? "border-[color-mix(in_oklab,var(--action-accept)_35%,transparent)] bg-[color-mix(in_oklab,var(--action-accept)_14%,transparent)] text-[var(--action-accept)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
                ].join(" ")}
              >
                {project?.status ?? "unknown"}
              </span>
            </div>
            <div className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--text-secondary)]">
              {project?.description || "No description."}
            </div>
            {project?.createdAt && (
              <div className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                Created {new Date(project.createdAt).toLocaleDateString()} · ID{" "}
                {String(project.id).slice(0, 8)}
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" className="shrink-0" disabled>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Edit
          </Button>
        </div>
      </div>

      {/* ============================================================
          2. STATS BAR
          ============================================================ */}
      <div className="flex flex-wrap items-stretch divide-x divide-[var(--border-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <StatItem label="Total entities" value={stats.totalEntities ?? 0} />
        <StatItem label="Tasks" value={totalTasks} tone="task" />
        <StatItem label="Open decisions" value={stats.openDecisions ?? 0} tone="decision" />
        <StatItem label="Recent insights" value={stats.recentInsights ?? 0} tone="insight" />
        <StatItem
          label="Pending reviews"
          value={pendingReviewsQ.data?.count ?? 0}
          tone="review"
        />
      </div>

      {/* ============================================================
          3. EPICS SECTION
          ============================================================ */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <button
          onClick={() => setEpicsCollapsed((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <div>
            <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
              Epics
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {(data?.epics ?? []).length} epics with computed progress from child tasks
            </div>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={[
              "shrink-0 text-[var(--text-tertiary)] transition-transform",
              epicsCollapsed ? "-rotate-90" : "rotate-0",
            ].join(" ")}
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {!epicsCollapsed && (
          <div className="border-t border-[var(--border-subtle)] p-4">
            {(data?.epics ?? []).length === 0 ? (
              <div className="py-2 text-sm text-[var(--text-secondary)]">
                No epics yet. Epics are created when the AI organizer detects groupable work.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(data.epics ?? []).map((e: any, i: number) => {
                  const pct = Math.round((e.progress?.percent ?? 0) * 100);
                  const entityCountLabel = e.progress?.totalTasks ?? 0;

                  return (
                    <div
                      key={e.epic.id}
                      className="animate-in cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-4 transition-colors hover:border-[var(--border-medium)]"
                      style={{ animationDelay: `${i * 30}ms` }}
                      onClick={() => setSearchParam("epicId", e.epic.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {e.epic.name}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {e.epic.description || "No description."}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[11px] font-semibold text-[var(--text-tertiary)]">
                            {pct}%
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--border-subtle)_60%,black)]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-task),var(--accent-decision))] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="font-mono text-[10px] text-[var(--text-tertiary)]">
                          {e.progress?.doneTasks ?? 0}/{e.progress?.totalTasks ?? 0} tasks done
                        </div>
                        <Badge variant="muted">{entityCountLabel} tasks</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================================
          4. ENTITY LIST WITH TABS
          ============================================================ */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        {/* Tab bar */}
        <div className="flex items-end gap-4 border-b border-[var(--border-subtle)] px-4 pt-4">
          <TabButton
            label="All"
            count={allEntities.length}
            active={type === ""}
            onClick={() => setSearchParam("type", "")}
          />
          <TabButton
            label="Tasks"
            count={taskCount}
            active={type === "task"}
            onClick={() => setSearchParam("type", "task")}
            tone="task"
          />
          <TabButton
            label="Decisions"
            count={decisionCount}
            active={type === "decision"}
            onClick={() => setSearchParam("type", "decision")}
            tone="decision"
          />
          <TabButton
            label="Insights"
            count={insightCount}
            active={type === "insight"}
            onClick={() => setSearchParam("type", "insight")}
            tone="insight"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border-subtle)] p-4">
          <div className="min-w-[180px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Status
            </div>
            <div className="mt-1.5">
              <Input
                value={status}
                placeholder="e.g. captured, in_progress"
                onChange={(e) => setSearchParam("status", e.target.value.trim())}
              />
            </div>
          </div>

          <div className="min-w-[180px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Assignee
            </div>
            <div className="mt-1.5">
              <Select
                value={assigneeId}
                onChange={(e) => setSearchParam("assigneeId", e.target.value)}
              >
                <option value="">Anyone</option>
                {(usersQ.data?.items ?? []).map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="min-w-[200px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Epic
            </div>
            <div className="mt-1.5">
              <Select
                value={epicId}
                onChange={(e) => setSearchParam("epicId", e.target.value)}
              >
                <option value="">All epics</option>
                {(epicsQ.data?.items ?? []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {(status || assigneeId || epicId) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams();
                if (type) next.set("type", type);
                void navigate({ search: Object.fromEntries(next.entries()) as any });
              }}
            >
              Clear filters
            </Button>
          )}

          <div className="ml-auto">
            <Badge variant="muted">{filteredEntities.length} shown</Badge>
          </div>
        </div>

        {/* Entity rows */}
        <div className="p-4">
          {entitiesQ.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-secondary)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--border-medium)] border-t-transparent" />
              Loading entities...
            </div>
          ) : entitiesQ.isError ? (
            <div className="py-4 text-sm text-[var(--text-secondary)]">
              <div>{(entitiesQ.error as any)?.message ?? "Failed to load entities."}</div>
              <button
                onClick={() => entitiesQ.refetch()}
                className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
              >
                Retry
              </button>
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
              No entities match the current filters.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Ungrouped entities */}
              {ungrouped.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                      Ungrouped
                    </div>
                    <Badge variant="muted">{ungrouped.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {ungrouped.map((e, i) => (
                      <EntityRow key={e.id} entity={e} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Grouped by epic */}
              {Array.from(grouped.entries()).map(([eid, items]) => (
                <div key={eid} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                      {epicNameById.get(eid) ?? `Epic ${eid.slice(0, 8)}`}
                    </div>
                    <Badge variant="muted">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((e, i) => (
                      <EntityRow key={e.id} entity={e} index={i} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Show "all ungrouped" label only when there are no groups */}
              {ungrouped.length === 0 && grouped.size === 0 && (
                <div className="space-y-2">
                  {filteredEntities.map((e, i) => (
                    <EntityRow key={e.id} entity={e} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
          5. ACTIVITY FEED
          ============================================================ */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="border-b border-[var(--border-subtle)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
                Recent activity
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Latest entities captured and extracted by the system
              </div>
            </div>
            <Badge variant="muted">{(data?.recentEntities ?? []).length} recent</Badge>
          </div>
        </div>

        <div className="p-4">
          {(data?.recentEntities ?? []).length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--text-secondary)]">
              No recent activity for this project.
            </div>
          ) : (
            <div className="space-y-2">
              {(data.recentEntities ?? []).map((e: any, i: number) => (
                <Link
                  key={e.id}
                  to="/entities/$entityId"
                  params={{ entityId: e.id }}
                  className="animate-in group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 transition-colors hover:border-[var(--border-medium)]"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={e.type} />
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_85%,black)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
                        {e.status}
                      </span>
                      <ConfidenceBadge value={e.confidence} />
                    </div>
                    <div className="mt-1.5 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                      {e.content}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[10px] text-[var(--text-tertiary)]">
                      {e.createdAt ? relativeTime(e.createdAt) : ""}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {String(e.id).slice(0, 8)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
