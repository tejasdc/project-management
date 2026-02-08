import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { TypeBadge } from "../components/TypeBadge";

function JsonBlock(props: { value: unknown }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 font-mono text-[11px] text-[var(--text-secondary)]">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

export function EntityDetailPage() {
  const { entityId } = useParams({ from: "/entities/$entityId" });

  const entity = useQuery({
    queryKey: qk.entity(entityId),
    queryFn: async () => {
      const res = await api.api.entities[entityId].$get();
      return unwrapJson<{ entity: any }>(res);
    },
  });

  const events = useQuery({
    queryKey: qk.entityEvents(entityId),
    queryFn: async () => {
      const res = await api.api.entities[entityId].events.$get({ query: { limit: "50" } });
      return unwrapJson<{ items: any[] }>(res);
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

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={e.type} />
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
            {e.status}
          </span>
          <ConfidenceBadge value={e.confidence} />
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{e.id}</span>
        </div>

        <div className="mt-4 font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          {e.content}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
          <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
            Attributes
          </div>
          <div className="mt-3">
            <JsonBlock value={e.attributes ?? {}} />
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
                    {ev.permalink ? ` • link` : ""}
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
        </section>
      </div>
    </div>
  );
}

