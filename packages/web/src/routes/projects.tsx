import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { ProjectCard } from "../components/ProjectCard";
import { RouteError } from "./__root";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/Dialog";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/projects")({
  component: ProjectsPage,
  errorComponent: RouteError,
});

type StatusTab = "active" | "archived";

function ProjectsPage() {
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const queryClient = useQueryClient();

  /* ---- Fetch projects for the selected status tab ---- */
  const projects = useQuery({
    queryKey: qk.projects({ status: statusTab }),
    queryFn: async () => {
      const res = await api.api.projects.$get({ query: { status: statusTab } as any });
      return unwrapJson<{ items: any[] }>(res);
    },
  });

  /* ---- Also fetch all projects to get accurate tab counts ---- */
  const allProjects = useQuery({
    queryKey: qk.projects({ status: "all" }),
    queryFn: async () => {
      const res = await api.api.projects.$get({ query: { status: "all" } as any });
      return unwrapJson<{ items: any[] }>(res);
    },
    staleTime: 30_000,
  });

  const activeCount = (allProjects.data?.items ?? []).filter(
    (p: any) => p.status === "active",
  ).length;
  const archivedCount = (allProjects.data?.items ?? []).filter(
    (p: any) => p.status === "archived",
  ).length;

  /* ---- Fetch dashboard stats per project ---- */
  const projectItems = projects.data?.items ?? [];

  const dashboards = useQueries({
    queries: projectItems.map((p: any) => ({
      queryKey: qk.projectDashboard(p.id),
      enabled: Boolean(projects.data),
      queryFn: async () => {
        const res = await api.api.projects[":id"].dashboard.$get({
          param: { id: p.id } as any,
          query: {} as any,
        });
        return unwrapJson<any>(res);
      },
      staleTime: 30_000,
    })),
  });

  /* ---- Fetch pending review counts per project ---- */
  const reviewCounts = useQueries({
    queries: projectItems.map((p: any) => ({
      queryKey: qk.reviewQueueCount({ projectId: p.id, status: "pending" }),
      enabled: Boolean(projects.data),
      queryFn: async () => {
        const res = await api.api["review-queue"].count.$get({
          query: { projectId: p.id, status: "pending" } as any,
        });
        return unwrapJson<{ count: number }>(res);
      },
      staleTime: 15_000,
    })),
  });

  /* ---- Build stats + review count maps ---- */
  const statsByProjectId = new Map<string, any>();
  for (const q of dashboards) {
    const d: any = q.data;
    if (d?.project?.id) {
      statsByProjectId.set(d.project.id, {
        tasksByStatus: d?.stats?.tasksByStatus ?? {},
        openDecisions: d?.stats?.openDecisions ?? 0,
        recentInsights: d?.stats?.recentInsights ?? 0,
      });
    }
  }

  const reviewByProjectId = new Map<string, number>();
  for (let i = 0; i < projectItems.length; i++) {
    const count = (reviewCounts[i]?.data as any)?.count;
    if (typeof count === "number") {
      reviewByProjectId.set(projectItems[i].id, count);
    }
  }

  /* ---- Client-side search filter ---- */
  const searchLower = search.toLowerCase().trim();
  const filteredProjects = searchLower
    ? projectItems.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower),
      )
    : projectItems;

  /* ---- Create project mutation ---- */
  const createProject = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await api.api.projects.$post({ json: data } as any);
      return unwrapJson<any>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreateOpen(false);
    },
  });

  return (
    <div>
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)]">
          Projects
        </h1>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button onClick={() => setCreateOpen(true)}>+ New Project</Button>
        </div>
      </div>

      {/* ---- Status tabs ---- */}
      <div className="mt-5 flex items-center gap-1 border-b border-[var(--border-subtle)]">
        <TabButton
          active={statusTab === "active"}
          onClick={() => setStatusTab("active")}
          label="Active"
          count={activeCount}
        />
        <TabButton
          active={statusTab === "archived"}
          onClick={() => setStatusTab("archived")}
          label="Archived"
          count={archivedCount}
        />
      </div>

      {/* ---- Content ---- */}
      {projects.isLoading ? (
        <div className="mt-6 text-sm text-[var(--text-secondary)]">Loading...</div>
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
      ) : filteredProjects.length === 0 ? (
        <div className="mt-6 text-sm text-[var(--text-secondary)]">
          {searchLower
            ? `No projects matching "${search}".`
            : `No ${statusTab} projects yet.`}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredProjects.map((p: any, i: number) => (
            <ProjectCard
              key={p.id}
              project={p}
              index={i}
              stats={statsByProjectId.get(p.id)}
              reviewCount={reviewByProjectId.get(p.id)}
            />
          ))}
        </div>
      )}

      {/* ---- Create project dialog ---- */}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createProject.mutate(data)}
        isPending={createProject.isPending}
        error={createProject.error}
      />
    </div>
  );
}

/* ---- Tab button ---- */

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "relative px-3 py-2 text-sm font-semibold transition-colors",
        props.active
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
      ].join(" ")}
    >
      {props.label}
      <span
        className={[
          "ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-[1px] font-mono text-[10px] font-semibold",
          props.active
            ? "bg-[color-mix(in_oklab,var(--accent-task)_22%,transparent)] text-[var(--accent-task)]"
            : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]",
        ].join(" ")}
      >
        {props.count}
      </span>
      {props.active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--accent-task)]" />
      )}
    </button>
  );
}

/* ---- Create project dialog ---- */

function CreateProjectDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => void;
  isPending: boolean;
  error: Error | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    props.onSubmit({
      name: trimmed,
      description: description.trim() || undefined,
    });
  }

  /* Reset form when dialog opens */
  function handleOpenChange(open: boolean) {
    if (open) {
      setName("");
      setDescription("");
    }
    props.onOpenChange(open);
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <DialogDescription className="mt-1">
          Create a new project to organize tasks, decisions, and insights.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="project-name"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Name
            </label>
            <Input
              id="project-name"
              placeholder="e.g. Q1 Product Launch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label
              htmlFor="project-description"
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Description
              <span className="ml-1 font-normal text-[var(--text-tertiary)]">(optional)</span>
            </label>
            <Textarea
              id="project-description"
              placeholder="What is this project about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {props.error && (
            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[color-mix(in_oklab,var(--confidence-low)_8%,var(--bg-secondary))] p-3 text-xs text-[var(--text-secondary)]">
              {(props.error as any)?.message ?? "Something went wrong."}
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm" disabled={!name.trim() || props.isPending}>
              {props.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
