import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { TypeBadge } from "../components/TypeBadge";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ENTITY_STATUSES } from "@pm/shared";
import { useState } from "react";

function JsonBlock(props: { value: unknown }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 font-mono text-[11px] text-[var(--text-secondary)]">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

export function EntityDetailPage() {
  const { entityId } = useParams({ from: "/entities/$entityId" });
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

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
      const res = await api.api.entities[":id"].events.$get({ param: { id: entityId } as any, query: { limit: "50" } as any });
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

  if (entity.isLoading) return <div className="text-sm text-[var(--text-secondary)]">Loading…</div>;
  if (entity.isError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
        {(entity.error as any)?.message ?? "Failed to load entity."}
      </div>
    );
  }

  const e = entity.data!.entity;
  const project = (projectsQ.data?.items ?? []).find((p: any) => p.id === e.projectId) ?? null;
  const epic = (epicsQ.data?.items ?? []).find((x: any) => x.id === e.epicId) ?? null;
  const assignee = (usersQ.data?.items ?? []).find((u: any) => u.id === e.assigneeId) ?? null;

  const allowedStatuses = ((ENTITY_STATUSES as any)[e.type] ?? []) as string[];

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={e.type} />
          <Badge variant="muted">{e.status}</Badge>
          <ConfidenceBadge value={e.confidence} />
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{e.id}</span>
        </div>

        <div className="mt-4 font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          {e.content}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-xs text-[var(--text-tertiary)]">
            Project:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {project ? project.name : e.projectId ? e.projectId.slice(0, 8) : "—"}
            </span>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            Epic:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {epic ? epic.name : e.epicId ? e.epicId.slice(0, 8) : "—"}
            </span>
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            Assignee:{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {assignee ? assignee.name : e.assigneeId ? e.assigneeId.slice(0, 8) : "—"}
            </span>
          </div>
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
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Attributes
          </div>
          <div className="mt-3">
            {e.type === "task" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Category</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.category ?? "—"}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Owner</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.owner ?? "—"}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Priority</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.priority ?? "—"}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Complexity</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.complexity ?? "—"}</div>
                </div>
              </div>
            ) : e.type === "decision" ? (
              <div className="space-y-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Chosen</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.chosen ?? "—"}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Options</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                    {(e.attributes?.options ?? []).length ? (e.attributes.options as any[]).join("\n") : "—"}
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Rationale</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{e.attributes?.rationale ?? "—"}</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Sentiment</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{e.attributes?.sentiment ?? "—"}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Data points</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                    {(e.attributes?.dataPoints ?? []).length ? (e.attributes.dataPoints as any[]).join("\n") : "—"}
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Feasibility</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{e.attributes?.feasibility ?? "—"}</div>
                </div>
              </div>
            )}
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Raw JSON</div>
              <div className="mt-2">
                <JsonBlock value={e.attributes ?? {}} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            AI metadata
          </div>
          <div className="mt-3">
            <JsonBlock value={e.aiMeta ?? {}} />
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 lg:col-span-2">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Evidence
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(e.evidence ?? []).length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No evidence recorded.</div>
            ) : (
              (e.evidence ?? []).map((ev: any, i: number) => (
                <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    Quote
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                    {ev.quote}
                  </div>
                  <div className="mt-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                    rawNote {String(ev.rawNoteId).slice(0, 8)}
                    {ev.permalink ? (
                      <>
                        {" "}
                        •{" "}
                        <a
                          className="text-[var(--text-secondary)] underline decoration-[color-mix(in_oklab,var(--border-subtle)_65%,transparent)] underline-offset-2 hover:text-[var(--text-primary)]"
                          href={String(ev.permalink)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          permalink
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 lg:col-span-2">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Timeline
          </div>
          <div className="mt-3 space-y-3">
            {events.isLoading ? (
              <div className="text-sm text-[var(--text-secondary)]">Loading events…</div>
            ) : events.isError ? (
              <div className="text-sm text-[var(--text-secondary)]">
                {(events.error as any)?.message ?? "Failed to load events."}
              </div>
            ) : (events.data?.items ?? []).length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No events yet.</div>
            ) : (
              (events.data?.items ?? []).map((ev: any) => (
                <div key={ev.id} className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold">{ev.type}</div>
                    <div className="font-mono text-[10px] text-[var(--text-tertiary)]">
                      {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {ev.body ? (
                    <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{ev.body}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Add comment
            </div>
            <div className="mt-2">
              <textarea
                value={comment}
                onChange={(e2) => setComment(e2.target.value)}
                rows={3}
                placeholder="What changed? What did you learn?"
                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
              />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate(comment.trim())}
              >
                Post
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
