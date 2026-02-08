import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ProjectCard } from "../components/ProjectCard";
import { RouteError } from "./__root";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/projects")({
  component: ProjectsPage,
  errorComponent: RouteError,
});

function ProjectsPage() {
  const projects = useQuery({
    queryKey: qk.projects(),
    queryFn: async () => {
      const res = await api.api.projects.$get({ query: {} as any });
      return unwrapJson<{ items: any[] }>(res);
    },
  });

  const dashboards = useQueries({
    queries: (projects.data?.items ?? []).map((p: any) => ({
      queryKey: qk.projectDashboard(p.id),
      enabled: Boolean(projects.data),
      queryFn: async () => {
        const res = await api.api.projects[":id"].dashboard.$get({ param: { id: p.id } as any, query: {} as any });
        return unwrapJson<any>(res);
      },
      staleTime: 30_000,
    })),
  });

  const statsByProjectId = new Map<string, any>();
  for (const q of dashboards) {
    const d: any = q.data;
    if (d?.project?.id) {
      const tasksByStatus = d?.stats?.tasksByStatus ?? {};
      const totalTasks = Object.values(tasksByStatus).reduce((a: number, b: unknown) => a + Number(b ?? 0), 0);
      statsByProjectId.set(d.project.id, {
        tasks: totalTasks,
        openDecisions: d?.stats?.openDecisions ?? 0,
        recentInsights: d?.stats?.recentInsights ?? 0,
      });
    }
  }

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
          <div>{(projects.error as any)?.message ?? "Failed to load projects."}</div>
          <button
            onClick={() => projects.refetch()}
            className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(projects.data?.items ?? []).map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} stats={statsByProjectId.get(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
