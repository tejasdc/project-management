import { Outlet } from "@tanstack/react-router";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useUiStore } from "../../stores/ui";

export function AppShell() {
  const setQuickCaptureOpen = useUiStore((s) => s.setQuickCaptureOpen);

  return (
    <div className="min-h-full bg-[var(--bg-primary)]">
      <Header />
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[260px_1fr] md:px-6">
        <Sidebar />
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>

      <button
        type="button"
        onClick={() => setQuickCaptureOpen(true)}
        className="fixed bottom-5 right-5 z-[120] grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-task)] text-[var(--bg-primary)] shadow-[0_18px_46px_rgba(0,0,0,0.55)] ring-1 ring-white/10 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent-task)_55%,white)] md:bottom-8 md:right-8"
        aria-label="Quick capture"
        title="Quick capture"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
