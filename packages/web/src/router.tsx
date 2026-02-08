import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { AppShell } from "./components/layout/AppShell";
import { ProjectsPage } from "./routes/projects";
import { ReviewPage } from "./routes/review";
import { ProjectDashboardPage } from "./routes/projects.$projectId";
import { EntityDetailPage } from "./routes/entities.$entityId";

function RootError(props: { error: unknown }) {
  const msg = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <div className="mx-auto max-w-[880px] px-4 py-16">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-6">
        <div className="font-[var(--font-display)] text-xl font-extrabold tracking-[-0.02em]">
          Something went wrong
        </div>
        <div className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{msg}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-semibold hover:border-[var(--border-medium)]"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

function RouteError(props: { error: unknown }) {
  const msg = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
      <div className="text-sm font-semibold text-[var(--text-primary)]">Error</div>
      <div className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{msg}</div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RootError,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/projects" />,
  errorComponent: RouteError,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
  errorComponent: RouteError,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectDashboardPage,
  errorComponent: RouteError,
});

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review",
  component: ReviewPage,
  errorComponent: RouteError,
});

const entityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entities/$entityId",
  component: EntityDetailPage,
  errorComponent: RouteError,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  projectRoute,
  reviewRoute,
  entityRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

