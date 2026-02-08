import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { EntityRow } from "../components/EntityRow";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { Badge } from "../components/ui/Badge";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/history")({
  component: HistoryPage,
  errorComponent: RouteError,
});

type Tab = "reviews" | "entities" | "notes";

function prettyReviewType(t: string) {
  return t
    .split("_")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function formatTimestamp(s: string | null | undefined) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

function statusBadgeVariant(status: string): "success" | "danger" | "warning" | "muted" {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (status === "modified") return "warning";
  return "muted";
}

function ResolvedReviewsTab() {
  const accepted = useQuery({
    queryKey: qk.reviewQueue({ status: "accepted", _page: "history" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].$get({
        query: { status: "accepted", limit: "50" },
      });
      return unwrapJson<{ items: any[]; nextCursor: string | null }>(res);
    },
  });

  const rejected = useQuery({
    queryKey: qk.reviewQueue({ status: "rejected", _page: "history" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].$get({
        query: { status: "rejected", limit: "50" },
      });
      return unwrapJson<{ items: any[]; nextCursor: string | null }>(res);
    },
  });

  const modified = useQuery({
    queryKey: qk.reviewQueue({ status: "modified", _page: "history" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].$get({
        query: { status: "modified" as any, limit: "50" },
      });
      return unwrapJson<{ items: any[]; nextCursor: string | null }>(res);
    },
  });

  const isLoading = accepted.isLoading || rejected.isLoading || modified.isLoading;
  const isError = accepted.isError || rejected.isError || modified.isError;
  const errorMsg =
    (accepted.error as any)?.message ??
    (rejected.error as any)?.message ??
    (modified.error as any)?.message ??
    "Failed to load resolved reviews.";

  const items = [
    ...(accepted.data?.items ?? []),
    ...(rejected.data?.items ?? []),
    ...(modified.data?.items ?? []),
  ]
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.resolvedAt ?? a.updatedAt ?? a.createdAt).getTime();
      const tb = new Date(b.resolvedAt ?? b.updatedAt ?? b.createdAt).getTime();
      return tb - ta;
    });

  if (isLoading) {
    return <div className="mt-4 text-sm text-[var(--text-secondary)]">Loading resolved reviews...</div>;
  }

  if (isError) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <div>{errorMsg}</div>
        <button
          onClick={() => {
            void accepted.refetch();
            void rejected.refetch();
            void modified.refetch();
          }}
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-secondary)]">
        No resolved reviews yet. Items appear here after you accept, reject, or modify them in the review queue.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((item, i) => (
        <div
          key={item.id}
          className="animate-in rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
          style={{ animationDelay: `${i * 25}ms` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {prettyReviewType(item.reviewType)}
            </span>
            <Badge variant={statusBadgeVariant(item.status)}>
              {item.status}
            </Badge>
            <ConfidenceBadge value={item.aiConfidence} />
            <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
              {formatTimestamp(item.resolvedAt ?? item.updatedAt)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                AI suggestion
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--text-secondary)]">
                {JSON.stringify(item.aiSuggestion, null, 2)}
              </pre>
            </div>

            {item.userResolution ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                  User resolution
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--text-secondary)]">
                  {JSON.stringify(item.userResolution, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                  Resolution
                </div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  {item.status === "accepted" ? "Accepted as-is" : "Rejected without modification"}
                </div>
              </div>
            )}
          </div>

          {item.trainingComment ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--action-modify)_20%,var(--border-subtle))] bg-[color-mix(in_oklab,var(--action-modify)_6%,var(--bg-tertiary))] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                Training comment
              </div>
              <div className="mt-2 text-sm text-[var(--text-secondary)]">
                {item.trainingComment}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-[var(--text-tertiary)]">
            <span>id {String(item.id).slice(0, 8)}</span>
            {item.entityId ? <span>entity {String(item.entityId).slice(0, 8)}</span> : null}
            {item.projectId ? <span>project {String(item.projectId).slice(0, 8)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntitiesTab() {
  const entities = useQuery({
    queryKey: qk.entities({ _page: "history", _all: true }),
    queryFn: async () => {
      const res = await api.api.entities.$get({
        query: { limit: "100" } as any,
      });
      return unwrapJson<{ items: any[] }>(res);
    },
  });

  if (entities.isLoading) {
    return <div className="mt-4 text-sm text-[var(--text-secondary)]">Loading entities...</div>;
  }

  if (entities.isError) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <div>{(entities.error as any)?.message ?? "Failed to load entities."}</div>
        <button
          onClick={() => entities.refetch()}
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const items = (entities.data?.items ?? [])
    .slice()
    .sort((a: any, b: any) => {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-secondary)]">
        No entities extracted yet. Capture some notes first.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((e: any, i: number) => (
        <EntityRow key={e.id} entity={e} index={i} />
      ))}
    </div>
  );
}

function RawNotesTab() {
  const notes = useQuery({
    queryKey: qk.reviewQueue({ _type: "rawNotes", _page: "history" }),
    queryFn: async () => {
      const res = await api.api.notes.$get({
        query: { limit: "100" },
      });
      return unwrapJson<{ items: any[]; nextCursor: string | null }>(res);
    },
  });

  if (notes.isLoading) {
    return <div className="mt-4 text-sm text-[var(--text-secondary)]">Loading raw notes...</div>;
  }

  if (notes.isError) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        <div>{(notes.error as any)?.message ?? "Failed to load raw notes."}</div>
        <button
          onClick={() => notes.refetch()}
          className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const items = notes.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-secondary)]">
        No raw notes captured yet.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {items.map((note: any, i: number) => (
        <div
          key={note.id}
          className="animate-in rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
          style={{ animationDelay: `${i * 25}ms` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              {note.source ?? "unknown"}
            </span>
            <Badge variant={note.processed ? "success" : "muted"}>
              {note.processed ? "Processed" : "Pending"}
            </Badge>
            <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
              {formatTimestamp(note.capturedAt)}
            </span>
          </div>

          <div className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
            {note.content}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-[var(--text-tertiary)]">
            <span>id {String(note.id).slice(0, 8)}</span>
            {note.capturedBy ? <span>by {String(note.capturedBy).slice(0, 8)}</span> : null}
            {note.dedupeHash ? <span>hash {String(note.dedupeHash).slice(0, 8)}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("reviews");

  const tabs: { key: Tab; label: string }[] = [
    { key: "reviews", label: "Resolved reviews" },
    { key: "entities", label: "Entities" },
    { key: "notes", label: "Raw notes" },
  ];

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          History
        </div>
        <div className="mt-1 max-w-[80ch] text-sm text-[var(--text-secondary)]">
          A record of everything the system has processed. Reviews resolved, entities extracted, notes captured.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-1 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              "rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "reviews" ? <ResolvedReviewsTab /> : null}
      {activeTab === "entities" ? <EntitiesTab /> : null}
      {activeTab === "notes" ? <RawNotesTab /> : null}
    </div>
  );
}
