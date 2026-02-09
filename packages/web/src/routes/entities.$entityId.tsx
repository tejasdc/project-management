import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { TypeBadge } from "../components/TypeBadge";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Textarea } from "../components/ui/Textarea";
import { ENTITY_STATUSES } from "@pm/shared";
import { useState } from "react";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;
const AnyLink = Link as any;

export const Route = createAnyFileRoute("/entities/$entityId")({
  component: EntityDetailPage,
  errorComponent: RouteError,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Color for a confidence score */
function confidenceColor(v: number): string {
  if (v >= 0.8) return "var(--confidence-high)";
  if (v >= 0.5) return "var(--confidence-medium)";
  return "var(--confidence-low)";
}

/** Color for timeline event types */
function eventColor(type: string): string {
  switch (type) {
    case "status_change":
      return "var(--accent-decision)";
    case "comment":
      return "var(--accent-insight)";
    case "created":
      return "var(--confidence-medium)";
    default:
      return "var(--text-tertiary)";
  }
}

/** Human-readable event type label */
function eventLabel(type: string): string {
  switch (type) {
    case "status_change":
      return "Status Change";
    case "comment":
      return "Comment";
    case "reprocess":
      return "Reprocessed";
    default:
      return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/** Priority badge variant */
function priorityVariant(priority: string | undefined): "danger" | "warning" | "success" | "muted" {
  switch (priority) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "success";
    default:
      return "muted";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Conic-gradient confidence ring */
function ConfidenceRing(props: { value: number }) {
  const { value } = props;
  const pct = Math.round(value * 100);
  const color = confidenceColor(value);
  const deg = Math.round(value * 360);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${color} 0deg, ${color} ${deg}deg, var(--bg-tertiary) ${deg}deg, var(--bg-tertiary) 360deg)`,
        }}
      >
        {/* Inner circle to make the donut */}
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)]">
          <span className="font-mono text-lg font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        Overall Confidence
      </span>
    </div>
  );
}

/** Per-field confidence bar row */
function FieldConfidenceRow(props: { field: string; score: number }) {
  const { field, score } = props;
  const pct = Math.round(score * 100);
  const color = confidenceColor(score);
  const label = field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-[var(--text-secondary)]">{label}</span>
      <span className="w-10 shrink-0 text-right font-mono text-xs" style={{ color }}>
        {pct}%
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/** Timeline event node */
function TimelineEvent(props: { event: any; isLast: boolean; users: any[] }) {
  const { event: ev, isLast, users } = props;
  const color = eventColor(ev.type);
  const actor = users.find((u: any) => u.id === ev.actorUserId);

  return (
    <div className="relative flex gap-4">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div
          className="z-10 h-3 w-3 shrink-0 rounded-full border-2"
          style={{ borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 30%, transparent)` }}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-[var(--border-subtle)]" />
        )}
      </div>

      {/* Content */}
      <div className={`pb-6 ${isLast ? "pb-0" : ""}`} style={{ minWidth: 0, flex: 1 }}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              color,
              backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
            }}
          >
            {eventLabel(ev.type)}
          </span>
          {actor && (
            <span className="text-xs text-[var(--text-secondary)]">{actor.name}</span>
          )}
          <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
            {formatDateTime(ev.createdAt)}
          </span>
        </div>

        {/* Status change: old -> new */}
        {ev.type === "status_change" && ev.oldStatus && ev.newStatus && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-[var(--text-tertiary)] line-through">{ev.oldStatus}</span>
            <span className="text-[var(--text-tertiary)]">{"\u2192"}</span>
            <Badge variant="muted">{ev.newStatus}</Badge>
          </div>
        )}

        {/* Comment body */}
        {ev.type === "comment" && ev.body && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-secondary)]">
            {ev.body}
          </div>
        )}

        {/* Reprocess / other events with body */}
        {ev.type !== "comment" && ev.body && (
          <div className="mt-2 text-sm text-[var(--text-secondary)]">{ev.body}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function EntityDetailPage() {
  const { entityId } = useParams({ from: "/entities/$entityId" });
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  // --- Queries ---
  const entity = useQuery({
    queryKey: qk.entity(entityId),
    queryFn: async () => {
      const res = await api.api.entities[":id"].$get({ param: { id: entityId } as any });
      return unwrapJson<{ entity: any }>(res);
    },
  });

  const events = useQuery({
    queryKey: qk.entityEvents(entityId),
    queryFn: async () => {
      const res = await api.api.entities[":id"].events.$get({
        param: { id: entityId } as any,
        query: { limit: "50", order: "asc" } as any,
      });
      return unwrapJson<{ items: any[] }>(res);
    },
  });

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.api.users.$get();
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 60_000,
  });

  const projectsQ = useQuery({
    queryKey: qk.projects(),
    queryFn: async () => {
      const res = await api.api.projects.$get({ query: {} as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 30_000,
  });

  const epicsQ = useQuery({
    queryKey: ["epicsByProject", entity.data?.entity?.projectId ?? "none"],
    enabled: Boolean(entity.data?.entity?.projectId),
    queryFn: async () => {
      const pid = entity.data?.entity?.projectId;
      const res = await api.api.epics.$get({ query: { projectId: String(pid), limit: "100" } as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 30_000,
  });

  // --- Mutations ---
  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await api.api.entities[":id"].status.$post({ param: { id: entityId } as any, json: { newStatus } as any });
      return unwrapJson<{ entity: any }>(res);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.entity(entityId) });
      await qc.invalidateQueries({ queryKey: qk.entityEvents(entityId) });
    },
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.api.entities[":id"].events.$post({ param: { id: entityId } as any, json: { type: "comment", body } as any });
      return unwrapJson<{ event: any }>(res);
    },
    onSuccess: async () => {
      setComment("");
      await qc.invalidateQueries({ queryKey: qk.entityEvents(entityId) });
    },
  });

  // --- Loading / Error ---
  if (entity.isLoading) return <div className="text-sm text-[var(--text-secondary)]">Loading...</div>;
  if (entity.isError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <div>{(entity.error as any)?.message ?? "Failed to load entity."}</div>
        <button
          onClick={() => entity.refetch()}
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
        >
          Retry
        </button>
      </div>
    );
  }

  // --- Derived data ---
  const e = entity.data!.entity;
  const project = (projectsQ.data?.items ?? []).find((p: any) => p.id === e.projectId) ?? null;
  const epic = (epicsQ.data?.items ?? []).find((x: any) => x.id === e.epicId) ?? null;
  const assignee = (usersQ.data?.items ?? []).find((u: any) => u.id === e.assigneeId) ?? null;
  const allUsers = usersQ.data?.items ?? [];

  const allowedStatuses = ((ENTITY_STATUSES as any)[e.type] ?? []) as string[];
  const timelineItems = (events.data?.items ?? [])
    .slice()
    .sort((a: any, b: any) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });

  const aiMeta = e.aiMeta ?? {};
  const fieldConfidence = aiMeta.fieldConfidence ?? {};
  const fieldConfidenceEntries = Object.entries(fieldConfidence) as [string, { confidence: number }][];
  const overallConfidence = typeof e.confidence === "number" ? e.confidence : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* 1. Breadcrumb Navigation                                           */}
      {/* ================================================================== */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        <AnyLink
          to="/entities"
          search={{}}
          className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {"\u2190"}
        </AnyLink>
        <span>/</span>
        {project ? (
          <>
            <AnyLink
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {project.name}
            </AnyLink>
            <span>/</span>
          </>
        ) : (
          <>
            <span className="text-[var(--text-tertiary)]">No Project</span>
            <span>/</span>
          </>
        )}
        <span className="truncate text-[var(--text-primary)]">{e.content}</span>
      </nav>

      {/* ================================================================== */}
      {/* 2. Header Card                                                     */}
      {/* ================================================================== */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={e.type} />
          <Badge variant="muted">{e.status}</Badge>
          <ConfidenceBadge value={e.confidence} />
          {/* Task-specific attribute badges */}
          {e.type === "task" && e.attributes?.category && (
            <Badge variant="default">{e.attributes.category}</Badge>
          )}
          {e.type === "task" && e.attributes?.priority && (
            <Badge variant={priorityVariant(e.attributes.priority)}>{e.attributes.priority}</Badge>
          )}
          {e.type === "task" && e.attributes?.complexity && (
            <Badge variant="muted">{e.attributes.complexity}</Badge>
          )}
          {/* Decision-specific */}
          {e.type === "decision" && e.attributes?.chosen && (
            <Badge variant="success">Chosen: {e.attributes.chosen}</Badge>
          )}
          {/* Insight-specific */}
          {e.type === "insight" && e.attributes?.sentiment && (
            <Badge variant="default">{e.attributes.sentiment}</Badge>
          )}
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{e.id}</span>
        </div>

        {/* Title */}
        <div className="mt-4 font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          {e.content}
        </div>

        {/* Divider */}
        <div className="mt-4 border-t border-[var(--border-subtle)]" />

        {/* Metadata row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-xs text-[var(--text-tertiary)]">
            Project:{" "}
            {project ? (
              <AnyLink
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="font-semibold text-[var(--text-primary)] hover:underline"
              >
                {project.name}
              </AnyLink>
            ) : (
              <span className="font-semibold text-[var(--text-primary)]">
                {e.projectId ? e.projectId.slice(0, 8) : "\u2014"}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            Epic:{" "}
            {epic && project ? (
              <AnyLink
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="font-semibold text-[var(--text-primary)] hover:underline"
              >
                {epic.name}
              </AnyLink>
            ) : (
              <span className="font-semibold text-[var(--text-primary)]">
                {epic ? epic.name : e.epicId ? e.epicId.slice(0, 8) : "\u2014"}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            Assignee:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {assignee ? assignee.name : e.assigneeId ? e.assigneeId.slice(0, 8) : "\u2014"}
            </span>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            Created:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {formatDate(e.createdAt)}
            </span>
          </div>

          {/* Status selector */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Status
            </span>
            <select
              value={e.status}
              onChange={(ev) => updateStatus.mutate(ev.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
            >
              {allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Attributes detail (type-specific) - moved from separate card */}
        {e.type === "decision" && (
          <div className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-4">
            {e.attributes?.options?.length > 0 && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Options:{" "}
                <span className="text-[var(--text-secondary)]">
                  {(e.attributes.options as string[]).join(", ")}
                </span>
              </div>
            )}
            {e.attributes?.rationale && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Rationale:{" "}
                <span className="text-[var(--text-secondary)]">{e.attributes.rationale}</span>
              </div>
            )}
            {e.attributes?.decidedBy && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Decided by:{" "}
                <span className="font-semibold text-[var(--text-primary)]">{e.attributes.decidedBy}</span>
              </div>
            )}
          </div>
        )}

        {e.type === "task" && e.attributes?.owner && (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <div className="text-xs text-[var(--text-tertiary)]">
              Owner:{" "}
              <span className="font-semibold text-[var(--text-primary)]">{e.attributes.owner}</span>
            </div>
          </div>
        )}

        {e.type === "insight" && (
          <div className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-4">
            {e.attributes?.dataPoints?.length > 0 && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Data points:{" "}
                <span className="text-[var(--text-secondary)]">
                  {(e.attributes.dataPoints as string[]).join("; ")}
                </span>
              </div>
            )}
            {e.attributes?.feasibility && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Feasibility:{" "}
                <span className="text-[var(--text-secondary)]">{e.attributes.feasibility}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Row 1: Evidence (left) + AI Metadata (right) - two-column layout   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* -------------------------------------------------------------- */}
        {/* Evidence Card (green accent border)                             */}
        {/* -------------------------------------------------------------- */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-insight)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Evidence
          </div>
          <div className="mt-3 space-y-4">
            {(e.evidence ?? []).length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No evidence recorded.</div>
            ) : (
              (e.evidence ?? []).map((ev: any, i: number) => (
                <div key={i}>
                  <blockquote className="relative border-l-2 border-[var(--accent-insight)] pl-4">
                    <span
                      className="absolute -left-1 -top-3 font-serif text-2xl leading-none text-[var(--accent-insight)] opacity-40"
                      aria-hidden="true"
                    >
                      {"\u201C"}
                    </span>
                    <p className="whitespace-pre-wrap text-sm italic text-[var(--text-secondary)]">
                      {ev.quote}
                    </p>
                  </blockquote>
                  <div className="mt-2 flex items-center gap-2 pl-4 font-mono text-[10px] text-[var(--text-tertiary)]">
                    <span>rawNote {String(ev.rawNoteId).slice(0, 8)}</span>
                    {ev.permalink && (
                      <>
                        <span>{"\u00B7"}</span>
                        <a
                          className="text-[var(--text-secondary)] underline decoration-[color-mix(in_oklab,var(--border-subtle)_65%,transparent)] underline-offset-2 hover:text-[var(--text-primary)]"
                          href={String(ev.permalink)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open note {"\u2192"}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* AI Metadata Card (blue accent border)                           */}
        {/* -------------------------------------------------------------- */}
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-decision)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            AI Metadata
          </div>
          <div className="mt-4 space-y-6">
            {/* 3. Confidence Ring */}
            {overallConfidence !== null && (
              <div className="flex justify-center">
                <ConfidenceRing value={overallConfidence} />
              </div>
            )}

            {/* 4. Per-field confidence bars */}
            {fieldConfidenceEntries.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                  Field Confidence
                </div>
                <div className="space-y-2">
                  {fieldConfidenceEntries.map(([field, fc]) => (
                    <FieldConfidenceRow
                      key={field}
                      field={field}
                      score={typeof fc.confidence === "number" ? fc.confidence : 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 5. Model Info Section */}
            {(aiMeta.model || aiMeta.promptVersion || aiMeta.extractionRunId) && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                  Model Provenance
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="space-y-2 text-xs">
                    {aiMeta.model && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-tertiary)]">Model</span>
                        <span className="truncate font-mono text-[var(--text-secondary)]">{aiMeta.model}</span>
                      </div>
                    )}
                    {aiMeta.promptVersion && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-tertiary)]">Prompt Version</span>
                        <span className="font-mono text-[var(--text-secondary)]">{aiMeta.promptVersion}</span>
                      </div>
                    )}
                    {aiMeta.extractionRunId && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-tertiary)]">Run ID</span>
                        <span className="truncate font-mono text-[var(--text-secondary)]">{aiMeta.extractionRunId}</span>
                      </div>
                    )}
                    {aiMeta.extractedAt && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[var(--text-tertiary)]">Extracted</span>
                        <span className="font-mono text-[var(--text-secondary)]">{formatDateTime(aiMeta.extractedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Fallback: if no structured data, show raw JSON */}
            {!overallConfidence && fieldConfidenceEntries.length === 0 && !aiMeta.model && (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 font-mono text-[11px] text-[var(--text-secondary)]">
                {JSON.stringify(aiMeta, null, 2)}
              </pre>
            )}
          </div>
        </section>
      </div>

      {/* ================================================================== */}
      {/* Row 2: Activity Timeline (full width)                              */}
      {/* ================================================================== */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
        {/* Card header with Add Comment button */}
        <div className="flex items-center justify-between">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Activity Timeline
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const el = document.getElementById("entity-comment-input");
              if (el) el.focus();
            }}
          >
            Add Comment
          </Button>
        </div>

        <div className="mt-4">
          {events.isLoading ? (
            <div className="text-sm text-[var(--text-secondary)]">Loading events...</div>
          ) : events.isError ? (
            <div className="text-sm text-[var(--text-secondary)]">
              <div>{(events.error as any)?.message ?? "Failed to load events."}</div>
              <button
                onClick={() => events.refetch()}
                className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
              >
                Retry
              </button>
            </div>
          ) : timelineItems.length === 0 ? (
            <div className="text-sm text-[var(--text-secondary)]">No events yet.</div>
          ) : (
            <div>
              {timelineItems.map((ev: any, idx: number) => (
                <TimelineEvent
                  key={ev.id}
                  event={ev}
                  isLast={idx === timelineItems.length - 1}
                  users={allUsers}
                />
              ))}
            </div>
          )}

          {/* Comment input - inside timeline card */}
          <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <Textarea
              id="entity-comment-input"
              value={comment}
              onChange={(e2) => setComment(e2.target.value)}
              rows={3}
              placeholder="What changed? What did you learn?"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate(comment.trim())}
              >
                {addComment.isPending ? "Posting..." : "Post Comment"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
