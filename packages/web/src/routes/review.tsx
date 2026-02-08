import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ReviewCard } from "../components/ReviewCard";

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
  low_confidence: 90,
};

export function ReviewPage() {
  const qc = useQueryClient();

  const queue = useQuery({
    queryKey: qk.reviewQueue({ status: "pending" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].$get({ query: { status: "pending", limit: "50" } });
      return unwrapJson<{ items: any[] }>(res);
    },
    refetchInterval: 15_000,
  });

  const entityMap = useQuery({
    queryKey: ["reviewQueueEntities", (queue.data?.items ?? []).map((i) => i.entityId).filter(Boolean).sort().join(",")],
    enabled: (queue.data?.items ?? []).some((i) => Boolean(i.entityId)),
    queryFn: async () => {
      const ids = Array.from(new Set((queue.data?.items ?? []).map((i) => i.entityId).filter(Boolean)));
      const pairs = await Promise.all(
        ids.map(async (id) => {
          const res = await api.api.entities[id].$get();
          const json = await unwrapJson<{ entity: any }>(res);
          return [id, json.entity] as const;
        })
      );
      return new Map(pairs);
    },
    staleTime: 10_000,
  });

  const resolve = useMutation({
    mutationFn: async (args: { id: string; status: "accepted" | "rejected" | "modified"; userResolution?: any; trainingComment?: string }) => {
      const res = await api.api["review-queue"][args.id].resolve.$post({
        json: { status: args.status, userResolution: args.userResolution, trainingComment: args.trainingComment },
      });
      return unwrapJson<any>(res);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.reviewQueue({ status: "pending" }) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Resolve failed"),
  });

  const items = (queue.data?.items ?? []).slice().sort((a, b) => {
    const ap = a.projectId ?? "zzzz";
    const bp = b.projectId ?? "zzzz";
    if (ap !== bp) return ap.localeCompare(bp);
    const ae = a.entityId ?? "zzzz";
    const be = b.entityId ?? "zzzz";
    if (ae !== be) return ae.localeCompare(be);
    const ao = REVIEW_ORDER[a.reviewType] ?? 50;
    const bo = REVIEW_ORDER[b.reviewType] ?? 50;
    if (ao !== bo) return ao - bo;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  const byProject = groupBy(items, (i) => i.projectId ?? "unscoped");

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          Review queue
        </div>
        <div className="mt-1 max-w-[80ch] text-sm text-[var(--text-secondary)]">
          Low-confidence fields get quarantined here. Resolve them once. Teach the system quietly.
        </div>
      </div>

      {queue.isLoading ? (
        <div className="mt-6 text-sm text-[var(--text-secondary)]">Loading…</div>
      ) : queue.isError ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
          {(queue.error as any)?.message ?? "Failed to load review queue."}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-sm text-[var(--text-secondary)]">
          Nothing pending. The machine is calm.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {Array.from(byProject.entries()).map(([projectId, projectItems], pi) => {
            const byEntity = groupBy(projectItems, (i) => i.entityId ?? "project");
            return (
              <section key={projectId} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
                    {projectId === "unscoped" ? "Unscoped" : `Project ${projectId.slice(0, 8)}`}
                  </div>
                  <div className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
                    {projectItems.length} items
                  </div>
                </div>

                <div className="space-y-4">
                  {Array.from(byEntity.entries()).map(([entityId, entityItems]) => {
                    const entity = entityId && entityId !== "project" ? entityMap.data?.get(entityId) ?? null : null;
                    return (
                      <div key={entityId} className="space-y-3">
                        {entity ? (
                          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                              Entity
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                              {entity.content}
                            </div>
                          </div>
                        ) : null}

                        {entityItems.map((item) => (
                          <ReviewCard
                            key={item.id}
                            item={item}
                            entity={entity}
                            onResolve={(args) => resolve.mutate({ id: item.id, ...args })}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

