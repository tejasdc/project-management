import { createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "../components/layout/AppShell";
import { AuthGate } from "../components/AuthGate";
import { SseProvider } from "../components/SseProvider";
import { QuickCapture } from "../components/QuickCapture";
import { Sonner } from "../components/ui/Sonner";

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
  return (
    <QueryClientProvider client={queryClient}>
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
