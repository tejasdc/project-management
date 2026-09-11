import { createRootRoute, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { AuthGate } from "../components/AuthGate";
import { SseProvider } from "../components/SseProvider";
import { QuickCapture } from "../components/QuickCapture";
import { Sonner } from "../components/ui/Sonner";
import { Homepage } from "../components/Homepage";

function shouldRetry(err: unknown) {
  const status =
    typeof err === "object" && err !== null && "status" in err ? (err as any).status : null;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err) => (shouldRetry(err) ? failureCount < 2 : false),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

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

export function RouteError(props: { error: unknown }) {
  const msg = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4">
      <div className="text-sm font-semibold text-[var(--text-primary)]">Error</div>
      <div className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{msg}</div>
    </div>
  );
}

function RootComponent() {
  const isHomepage = useRouterState({ select: state => state.location.pathname === "/" });
  useEffect(() => {
    document.title = isHomepage ? "Clarify.pm — Your notes, with a next step." : "Clarify.pm — Workspace";
  }, [isHomepage]);
  if (isHomepage) return <Homepage />;
  return (
    <QueryClientProvider client={queryClient}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <AuthGate>
        <SseProvider />
        <AppShell />
        <QuickCapture />
        <Sonner />
      </AuthGate>
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
});
