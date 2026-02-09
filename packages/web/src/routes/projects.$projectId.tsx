import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../components/ui/Dialog";
import { Textarea } from "../components/ui/Textarea";
import { useUiStore } from "../stores/ui";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/projects/$projectId")({
  component: ProjectDashboardPage,
  errorComponent: RouteError,
});

/* ---------- Stat card ---------- */

function StatCard(props: {
  label: string;
  value: string | number;
  subLabel?: string;
  tone?: "task" | "decision" | "insight" | "review";
  alert?: boolean;
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
    <div
      className="flex flex-1 flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: toneColor }}
    >
      <div
        className="font-[var(--font-display)] text-[24px] font-extrabold tracking-[-0.03em]"
        style={{ color: toneColor }}
      >
        {props.value}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
        {props.label}
      </div>
      {props.subLabel && (
        <div
          className={[
            "mt-0.5 text-[10px]",
            props.alert
              ? "font-semibold text-[var(--action-reject)]"
              : "text-[var(--text-tertiary)]",
          ].join(" ")}
        >
          {props.subLabel}
        </div>
      )}
    </div>
  );
}

/* ---------- Entity type tab ---------- */

type EntityTab = "epics" | "" | "task" | "decision" | "insight" | "unepiced";

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

/* ---------- Chevron icon ---------- */

function ChevronIcon(props: { open: boolean; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={[
        "shrink-0 text-[var(--text-tertiary)] transition-transform duration-200",
        props.open ? "rotate-90" : "rotate-0",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Assignee helpers ---------- */

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

/* ---------- Entity table row (for inside epics accordion) ---------- */

function EntityTableRow(props: { entity: any; userName?: string | null; even: boolean }) {
  const e = props.entity;
  return (
    <Link
      to="/entities/$entityId"
      params={{ entityId: e.id }}
      className={[
        "group grid grid-cols-[80px_1fr_100px_120px] items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[color-mix(in_oklab,var(--bg-tertiary)_60%,transparent)]",
        props.even ? "bg-[color-mix(in_oklab,var(--bg-tertiary)_30%,transparent)]" : "",
      ].join(" ")}
    >
      {/* Type */}
      <div>
        <TypeBadge type={e.type} />
      </div>
      {/* Content */}
      <div className="min-w-0 truncate font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-task)]">
        {e.content}
      </div>
      {/* Status */}
      <div>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
          {e.status}
        </span>
      </div>
      {/* Assignee */}
      <div className="flex items-center gap-2">
        {props.userName ? (
          <>
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
              style={{ backgroundColor: stringToColor(props.userName) }}
            >
              {getInitials(props.userName)}
            </div>
            <span className="truncate text-xs text-[var(--text-secondary)]">{props.userName}</span>
          </>
        ) : (
          <span className="text-[10px] text-[var(--text-tertiary)]">Unassigned</span>
        )}
      </div>
    </Link>
  );
}

/* ---------- Epic accordion card ---------- */

function EpicAccordionCard(props: {
  epic: any;
  progress: any;
  entities: any[];
  expanded: boolean;
  onToggle: () => void;
  usersById: Map<string, any>;
}) {
  const { epic, progress, entities, expanded, onToggle, usersById } = props;
  const pct = Math.round((progress?.percent ?? 0) * 100);
  const total = progress?.totalTasks ?? 0;
  const done = progress?.doneTasks ?? 0;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] transition-colors">
      {/* Header (clickable) */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--bg-tertiary)_40%,transparent)]"
      >
        <ChevronIcon open={expanded} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {epic.name}
            </span>
            {epic.description && (
              <span className="hidden truncate text-xs text-[var(--text-tertiary)] sm:inline">
                {epic.description}
              </span>
            )}
          </div>
        </div>
        {/* Progress bar + label */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden w-32 sm:block">
            <div className="h-[5px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--border-subtle)_60%,black)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-task),var(--accent-decision))] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap font-mono text-[11px] text-[var(--text-tertiary)]">
            {pct}% &middot; {done}/{total} tasks
          </span>
        </div>
      </button>

      {/* Expanded body: entity table */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)]">
          {entities.length === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-[var(--text-secondary)]">
              No entities in this epic yet.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[80px_1fr_100px_120px] gap-3 border-b border-[var(--border-subtle)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                <div>Type</div>
                <div>Content</div>
                <div>Status</div>
                <div>Assignee</div>
              </div>
              {/* Rows */}
              {entities.map((e: any, i: number) => {
                const user = e.assigneeId ? usersById.get(e.assigneeId) : null;
                return (
                  <EntityTableRow
                    key={e.id}
                    entity={e}
                    userName={user?.name ?? null}
                    even={i % 2 === 0}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Main page component ---------- */

export function ProjectDashboardPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const locationHref = useRouterState({ select: (s) => s.location.href });
  const queryClient = useQueryClient();
  const setQuickCaptureOpen = useUiStore((s) => s.setQuickCaptureOpen);

  const sp = new URLSearchParams(new URL(locationHref, "http://x").search);
  const tab = (sp.get("tab") || "epics") as EntityTab;
  const type = tab === "task" || tab === "decision" || tab === "insight" ? tab : "";
  const status = sp.get("status") || "";
  const assigneeId = sp.get("assigneeId") || "";
  const epicId = sp.get("epicId") || "";

  // Expanded epics set
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());

  // Create epic dialog state
  const [createEpicOpen, setCreateEpicOpen] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [newEpicDesc, setNewEpicDesc] = useState("");

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

  /* ---- Create epic mutation ---- */

  const createEpicMut = useMutation({
    mutationFn: async (body: { name: string; description?: string; projectId: string }) => {
      const res = await api.api.epics.$post({
        json: body as any,
      });
      return unwrapJson<{ epic: any }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["epics", String(projectId)] });
      void queryClient.invalidateQueries({ queryKey: qk.projectDashboard(String(projectId)) });
      setCreateEpicOpen(false);
      setNewEpicName("");
      setNewEpicDesc("");
    },
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
  const tasksByStatus = (stats as any).tasksByStatus ?? {};
  const totalTasks = Object.values(tasksByStatus).reduce(
    (a: number, b: unknown) => a + Number((b as any) ?? 0),
    0,
  ) as number;
  const inProgressTasks = Number(tasksByStatus.in_progress ?? 0);
  const pendingDecisions = Number(stats.openDecisions ?? 0);
  const pendingReviewCount = pendingReviewsQ.data?.count ?? 0;

  /* ---- User lookup map ---- */
  const usersById = new Map<string, any>(
    (usersQ.data?.items ?? []).map((u: any) => [u.id, u] as const),
  );

  /* ---- Helpers for entity counts by type ---- */
  const allEntities = (entitiesQ.data?.items ?? []) as any[];
  const taskCount = allEntities.filter((e) => e.type === "task").length;
  const decisionCount = allEntities.filter((e) => e.type === "decision").length;
  const insightCount = allEntities.filter((e) => e.type === "insight").length;
  const unepicedEntities = allEntities.filter((e) => !e.epicId);

  /* ---- Filter navigation helper ---- */
  function setSearchParam(key: string, value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    void navigate({ search: Object.fromEntries(next.entries()) as any });
  }

  function setTab(newTab: EntityTab) {
    const next = new URLSearchParams();
    if (newTab && newTab !== "epics") next.set("tab", newTab);
    // Keep other filters when switching non-epic tabs
    if (status) next.set("status", status);
    if (assigneeId) next.set("assigneeId", assigneeId);
    if (epicId) next.set("epicId", epicId);
    void navigate({ search: Object.fromEntries(next.entries()) as any });
  }

  /* ---- Epic accordion toggle ---- */
  function toggleEpic(epicId: string) {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  }

  /* ---- Build entity lists grouped by epic for accordion ---- */
  const entitiesByEpicId = new Map<string, any[]>();
  for (const e of allEntities) {
    if (!e.epicId) continue;
    const arr = entitiesByEpicId.get(e.epicId) ?? [];
    arr.push(e);
    entitiesByEpicId.set(e.epicId, arr);
  }

  /* ---- Entity list filtering by epic (for non-epic tabs) ---- */
  const epicFilter = epicId || null;
  const filteredEntities = epicFilter
    ? allEntities.filter((e) => e.epicId === epicFilter)
    : tab === "unepiced"
    ? unepicedEntities
    : allEntities;

  const epicNameById = new Map(
    (epicsQ.data?.items ?? []).map((e: any) => [e.id, e.name] as const),
  );

  /* ---- Determine if we show epics accordion or entity list ---- */
  const showEpicsView = tab === "epics";
  const showEntityList = !showEpicsView;

  return (
    <div className="space-y-6">
      {/* ============================================================
          0. BACK LINK
          ============================================================ */}
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M19 12H5m0 0l7 7m-7-7l7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Projects
      </Link>

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
          2. STAT CARDS
          ============================================================ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Tasks"
          value={totalTasks}
          subLabel={inProgressTasks > 0 ? `${inProgressTasks} in progress` : undefined}
          tone="task"
        />
        <StatCard
          label="Decisions"
          value={pendingDecisions + (Number(tasksByStatus.decided ?? 0) || 0)}
          subLabel={pendingDecisions > 0 ? `${pendingDecisions} pending` : undefined}
          tone="decision"
        />
        <StatCard
          label="Insights"
          value={stats.recentInsights ?? 0}
          subLabel="recent"
          tone="insight"
        />
        <StatCard
          label="Reviews"
          value={pendingReviewCount}
          subLabel={pendingReviewCount > 0 ? "pending review" : undefined}
          tone="review"
          alert={pendingReviewCount > 0}
        />
      </div>

      {/* ============================================================
          3. MAIN CONTENT: TAB BAR + CONTENT
          ============================================================ */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        {/* Tab bar */}
        <div className="flex items-end gap-4 border-b border-[var(--border-subtle)] px-4 pt-4">
          <TabButton
            label="Epics"
            count={(data?.epics ?? []).length}
            active={tab === "epics"}
            onClick={() => setTab("epics")}
          />
          <TabButton
            label="All"
            count={allEntities.length}
            active={tab === ""}
            onClick={() => setTab("")}
          />
          <TabButton
            label="Tasks"
            count={taskCount}
            active={tab === "task"}
            onClick={() => setTab("task")}
            tone="task"
          />
          <TabButton
            label="Decisions"
            count={decisionCount}
            active={tab === "decision"}
            onClick={() => setTab("decision")}
            tone="decision"
          />
          <TabButton
            label="Insights"
            count={insightCount}
            active={tab === "insight"}
            onClick={() => setTab("insight")}
            tone="insight"
          />
          <TabButton
            label="Unepiced"
            count={unepicedEntities.length}
            active={tab === "unepiced"}
            onClick={() => setTab("unepiced")}
          />
          {/* Spacer + action buttons */}
          <div className="ml-auto flex items-center gap-2 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuickCaptureOpen(true)}
              title="Capture a new entity"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Entity
            </Button>
          </div>
        </div>

        {/* ---- EPICS VIEW (accordion) ---- */}
        {showEpicsView && (
          <div className="p-4">
            {/* Header with create button */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-secondary)]">
                {(data?.epics ?? []).length} epics with computed progress from child tasks
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreateEpicOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Create Epic
              </Button>
            </div>

            {(data?.epics ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
                No epics yet. Epics are created when the AI organizer detects groupable work, or you can create one manually.
              </div>
            ) : (
              <div className="space-y-3">
                {(data.epics ?? []).map((epicEntry: any, i: number) => (
                  <div
                    key={epicEntry.epic.id}
                    className="animate-in"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <EpicAccordionCard
                      epic={epicEntry.epic}
                      progress={epicEntry.progress}
                      entities={entitiesByEpicId.get(epicEntry.epic.id) ?? []}
                      expanded={expandedEpics.has(epicEntry.epic.id)}
                      onToggle={() => toggleEpic(epicEntry.epic.id)}
                      usersById={usersById}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- ENTITY LIST VIEW (for All, Tasks, Decisions, Insights, Unepiced tabs) ---- */}
        {showEntityList && (
          <>
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

              {tab !== "unepiced" && (
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
              )}

              {(status || assigneeId || epicId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams();
                    if (tab) next.set("tab", tab);
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
                  {tab === "unepiced"
                    ? "All entities are assigned to an epic."
                    : "No entities match the current filters."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEntities.map((e: any, i: number) => {
                    const user = e.assigneeId ? usersById.get(e.assigneeId) : null;
                    return (
                      <EntityRow
                        key={e.id}
                        entity={e}
                        index={i}
                        assigneeName={user?.name ?? null}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ============================================================
          4. ACTIVITY FEED
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

      {/* ============================================================
          5. CREATE EPIC DIALOG
          ============================================================ */}
      <Dialog open={createEpicOpen} onOpenChange={setCreateEpicOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Epic</DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-[var(--radius-md)] p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </DialogClose>
          </DialogHeader>
          <DialogDescription>
            Group related tasks, decisions, and insights under an epic.
          </DialogDescription>
          <form
            className="mt-4 space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!newEpicName.trim()) return;
              createEpicMut.mutate({
                name: newEpicName.trim(),
                description: newEpicDesc.trim() || undefined,
                projectId: String(projectId),
              });
            }}
          >
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Name
              </label>
              <Input
                value={newEpicName}
                onChange={(e) => setNewEpicName(e.target.value)}
                placeholder="Epic name"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Description
              </label>
              <Textarea
                value={newEpicDesc}
                onChange={(e) => setNewEpicDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            {createEpicMut.isError && (
              <div className="text-xs text-[var(--action-reject)]">
                {(createEpicMut.error as any)?.message ?? "Failed to create epic."}
              </div>
            )}
            <DialogFooter className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" size="sm" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                type="submit"
                disabled={!newEpicName.trim() || createEpicMut.isPending}
              >
                {createEpicMut.isPending ? "Creating..." : "Create Epic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
