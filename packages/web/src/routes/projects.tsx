import { useQuery } from "@tanstack/react-query";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ProjectCard } from "../components/ProjectCard";

export function ProjectsPage() {
  const projects = useQuery({
    queryKey: qk.projects(),
    queryFn: async () => {
      const res = await api.api.projects.$get();
      return unwrapJson<{ items: any[] }>(res);
    },
  });

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          Projects
        </div>
        <div className="mt-1 max-w-[70ch] text-sm text-[var(--text-secondary)]">
          A small, sharp list. Everything else is noise until captured and routed.
        </div>
      </div>

      {projects.isLoading ? (
        <div className="mt-6 text-sm text-[var(--text-secondary)]">Loading…</div>
      ) : projects.isError ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
          {(projects.error as any)?.message ?? "Failed to load projects."}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(projects.data?.items ?? []).map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

