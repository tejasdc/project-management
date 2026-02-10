import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ReviewCard } from "../components/ReviewCard";
import { RouteError } from "./__root";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/review")({
  component: ReviewPage,
  errorComponent: RouteError,
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function groupBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = m.get(k) ?? [];
    arr.push(item);
    m.set(k, arr);
  }
  return m;
}

const REVIEW_ORDER: Record<string, number> = {
  type_classification: 1,
  project_assignment: 2,
  epic_assignment: 3,
  assignee_suggestion: 4,
  duplicate_detection: 5,
  epic_creation: 6,
  project_creation: 7,
  low_confidence: 90,
};

/** Human-readable label for review types. */
function prettyReviewType(t: string) {
  if (t === "low_confidence") return "Needs Review";
  return t
    .split("_")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

/** Left-border color per review type. */
const REVIEW_TYPE_COLORS: Record<string, string> = {
  project_assignment: "rgb(59 130 246)",   // blue
  epic_creation: "rgb(34 197 94)",         // green
  epic_assignment: "rgb(34 197 94)",       // green
  duplicate_detection: "rgb(245 158 11)",  // amber
  low_confidence: "rgb(239 68 68)",        // red
  type_classification: "rgb(168 85 247)",  // purple
  assignee_suggestion: "rgb(14 165 233)",  // sky
  project_creation: "rgb(59 130 246)",     // blue
};

/** All review type options for the filter dropdown. */
const REVIEW_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "type_classification", label: "Type Classification" },
  { value: "project_assignment", label: "Project Assignment" },
  { value: "project_creation", label: "Project Creation" },
  { value: "epic_assignment", label: "Epic Assignment" },
  { value: "epic_creation", label: "Epic Creation" },
  { value: "duplicate_detection", label: "Duplicate Detection" },
  { value: "low_confidence", label: "Needs Review" },
  { value: "assignee_suggestion", label: "Assignee Suggestion" },
];

type GroupMode = "reviewType" | "project";

/* -------------------------------------------------------------------------- */
/*  Chevron SVG                                                               */
/* -------------------------------------------------------------------------- */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 transition-transform duration-200"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Collapsible Section                                                       */
/* -------------------------------------------------------------------------- */

function CollapsibleSection(props: {
  label: string;
  count: number;
  borderColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);

  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden"
      style={{ borderLeftWidth: "3px", borderLeftColor: props.borderColor }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <ChevronIcon open={open} />
        <span className="font-[var(--font-display)] text-sm font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
          {props.label}
        </span>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[1px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
          {props.count}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 px-4 pb-4">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

function ReviewPage() {
  const qc = useQueryClient();

  /* ---- Filter state ---- */
  const [typeFilter, setTypeFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("reviewType");

  /* ---- Pending count ---- */
  const countQuery = useQuery({
    queryKey: qk.reviewQueueCount({ status: "pending" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].count.$get({
        query: { status: "pending" },
      });
      return unwrapJson<{ count: number }>(res);
    },
    refetchInterval: 15_000,
  });

  /* ---- Review items (filtered) ---- */
  const queryFilters: Record<string, string> = { status: "pending", limit: "50" };
  if (typeFilter) queryFilters.reviewType = typeFilter;
  if (projectFilter) queryFilters.projectId = projectFilter;

  const queue = useQuery({
    queryKey: qk.reviewQueue(queryFilters),
    queryFn: async () => {
      const res = await api.api["review-queue"].$get({ query: queryFilters as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    refetchInterval: 15_000,
  });

  /* ---- Projects (for filter + labels) ---- */
  const projectsQuery = useQuery({
    queryKey: qk.projects(),
    queryFn: async () => {
      const res = await api.api.projects.$get({ query: {} as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 30_000,
  });

  const projectMap = new Map<string, string>();
  for (const p of projectsQuery.data?.items ?? []) {
    projectMap.set(p.id, p.name);
  }

  /* ---- Entities for review items ---- */
  const entityMap = useQuery({
    queryKey: [
      "reviewQueueEntities",
      (queue.data?.items ?? [])
        .map((i) => i.entityId)
        .filter(Boolean)
        .sort()
        .join(","),
    ],
    enabled: (queue.data?.items ?? []).some((i) => Boolean(i.entityId)),
    queryFn: async () => {
      const ids = Array.from(
        new Set(
          (queue.data?.items ?? []).map((i) => i.entityId).filter(Boolean)
        )
      );
      const pairs = await Promise.all(
        ids.map(async (id) => {
          const res = await api.api.entities[":id"].$get({
            param: { id } as any,
          });
          const json = await unwrapJson<{ entity: any }>(res);
          return [id, json.entity] as const;
        })
      );
      return new Map(pairs);
    },
    staleTime: 10_000,
  });

  /* ---- Resolve mutation (optimistic) ---- */
  const resolve = useMutation({
    mutationFn: async (args: {
      id: string;
      status: "accepted" | "rejected" | "modified";
      userResolution?: any;
      trainingComment?: string;
    }) => {
      const res = await api.api["review-queue"][":id"].resolve.$post({
        param: { id: args.id } as any,
        json: {
          status: args.status,
          userResolution: args.userResolution,
          trainingComment: args.trainingComment,
        },
      });
      return unwrapJson<any>(res);
    },
    onMutate: async (args) => {
      // Cancel in-flight refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ["reviewQueue"] });

      // Snapshot current cache for rollback
      const prevQueue = qc.getQueryData(qk.reviewQueue(queryFilters));
      const prevCount = qc.getQueryData(qk.reviewQueueCount({ status: "pending" }));

      // Optimistically remove the item from the list
      qc.setQueryData(qk.reviewQueue(queryFilters), (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.filter((i: any) => i.id !== args.id) };
      });

      // Optimistically decrement the pending count
      qc.setQueryData(qk.reviewQueueCount({ status: "pending" }), (old: any) => {
        if (!old || typeof old.count !== "number") return old;
        return { ...old, count: Math.max(0, old.count - 1) };
      });

      return { prevQueue, prevCount };
    },
    onError: (err, _args, context) => {
      // Roll back on failure
      if (context?.prevQueue) {
        qc.setQueryData(qk.reviewQueue(queryFilters), context.prevQueue);
      }
      if (context?.prevCount) {
        qc.setQueryData(qk.reviewQueueCount({ status: "pending" }), context.prevCount);
      }
      toast.error(err instanceof Error ? err.message : "Resolve failed");
    },
    onSettled: () => {
      // Refetch to reconcile with server state
      void qc.invalidateQueries({ queryKey: ["reviewQueue"] });
    },
  });

  /* ---- Sort items ---- */
  const items = (queue.data?.items ?? []).slice().sort((a, b) => {
    const ao = REVIEW_ORDER[a.reviewType] ?? 50;
    const bo = REVIEW_ORDER[b.reviewType] ?? 50;
    if (ao !== bo) return ao - bo;
    const ap = a.projectId ?? "zzzz";
    const bp = b.projectId ?? "zzzz";
    if (ap !== bp) return ap.localeCompare(bp);
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  /* ---- Group ---- */
  const groups =
    groupMode === "reviewType"
      ? groupBy(items, (i) => i.reviewType)
      : groupBy(items, (i) => i.projectId ?? "unscoped");

  /* ---- Sorted group keys ---- */
  const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (groupMode === "reviewType") {
      return (REVIEW_ORDER[a] ?? 50) - (REVIEW_ORDER[b] ?? 50);
    }
    // project mode: sort by name, unscoped last
    if (a === "unscoped") return 1;
    if (b === "unscoped") return -1;
    const nameA = projectMap.get(a) ?? a;
    const nameB = projectMap.get(b) ?? b;
    return nameA.localeCompare(nameB);
  });

  const pendingCount = countQuery.data?.count ?? null;

  return (
    <div>
      {/* ================================================================
          1. PAGE HEADER
          ================================================================ */}
      <div className="flex items-center gap-3">
        <h1 className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)]">
          Review Queue
        </h1>
        {pendingCount !== null ? (
          <span className="rounded-full bg-[color-mix(in_oklab,var(--accent-task)_22%,transparent)] px-2.5 py-[2px] text-[11px] font-bold text-[var(--text-primary)]">
            {pendingCount} pending
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-[80ch] text-sm text-[var(--text-secondary)]">
        Below-threshold items get quarantined here. Resolve them once. Teach the system quietly.
      </p>

      {/* ================================================================
          2. FILTER BAR
          ================================================================ */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-auto min-w-[180px]"
          aria-label="Filter by review type"
        >
          {REVIEW_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        {/* Project filter */}
        <Select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="w-auto min-w-[180px]"
          aria-label="Filter by project"
        >
          <option value="">All Projects</option>
          {(projectsQuery.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Group-by toggle */}
        <div className="flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
          <Button
            size="sm"
            variant={groupMode === "reviewType" ? "default" : "ghost"}
            className="rounded-none border-0"
            onClick={() => setGroupMode("reviewType")}
          >
            Review Type
          </Button>
          <Button
            size="sm"
            variant={groupMode === "project" ? "default" : "ghost"}
            className="rounded-none border-0 border-l border-l-[var(--border-subtle)]"
            onClick={() => setGroupMode("project")}
          >
            Project
          </Button>
        </div>
      </div>

      {/* ================================================================
          3. CONTENT AREA
          ================================================================ */}
      {queue.isLoading ? (
        <div className="mt-6 text-sm text-[var(--text-secondary)]">Loading...</div>
      ) : queue.isError ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
          <div>
            {(queue.error as any)?.message ?? "Failed to load review queue."}
          </div>
          <button
            onClick={() => queue.refetch()}
            className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-secondary)]">
          Nothing pending. The machine is calm.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Entity fetch error banner */}
          {entityMap.isError ? (
            <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
              <div>
                {(entityMap.error as any)?.message ??
                  "Failed to load entities for review."}
              </div>
              <button
                onClick={() => entityMap.refetch()}
                className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
              >
                Retry
              </button>
            </div>
          ) : null}

          {/* Grouped sections */}
          {sortedGroupKeys.map((groupKey) => {
            const groupItems = groups.get(groupKey)!;

            const borderColor =
              groupMode === "reviewType"
                ? REVIEW_TYPE_COLORS[groupKey] ?? "var(--border-medium)"
                : "var(--border-medium)";

            const label =
              groupMode === "reviewType"
                ? prettyReviewType(groupKey)
                : groupKey === "unscoped"
                  ? "Unscoped"
                  : projectMap.get(groupKey) ?? `Project ${groupKey.slice(0, 8)}`;

            // Build entity groups within each section
            const byEntity = groupBy(
              groupItems,
              (i) => i.entityId ?? "project"
            );

            let cardIndex = 0;

            return (
              <CollapsibleSection
                key={groupKey}
                label={label}
                count={groupItems.length}
                borderColor={borderColor}
                defaultOpen
              >
                {Array.from(byEntity.entries()).map(
                  ([entityId, entityItems]) => {
                    const entity =
                      entityId && entityId !== "project"
                        ? entityMap.data?.get(entityId) ?? null
                        : null;

                    return (
                      <div key={entityId} className="space-y-3">
                        {entity ? (
                          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                              Entity
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                              {entity.content}
                            </div>
                          </div>
                        ) : null}

                        {entityItems.map((item) => {
                          const delay = cardIndex * 30;
                          cardIndex++;
                          return (
                            <div
                              key={item.id}
                              className="animate-in"
                              style={{ animationDelay: `${delay}ms` }}
                            >
                              <ReviewCard
                                item={item}
                                entity={entity}
                                disabled={resolve.isPending && resolve.variables?.id === item.id}
                                onResolve={(args) =>
                                  resolve.mutate({ id: item.id, ...args })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                )}
              </CollapsibleSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
