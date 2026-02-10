import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { setApiKey } from "../../lib/api-client";
import { useUiStore } from "../../stores/ui";

function Logo() {
  return (
    <Link to="/projects" className="flex items-center gap-2 no-underline">
      <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-[linear-gradient(135deg,var(--accent-task),var(--accent-decision),var(--accent-insight))] shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset,0_10px_30px_rgba(0,0,0,0.45)]" />
      <span className="font-[var(--font-display)] text-[18px] font-extrabold tracking-[-0.03em] text-[var(--text-primary)]">
        PM Agent
      </span>
    </Link>
  );
}

function ModalShell(props: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center px-4">
      <button
        onClick={props.onClose}
        className="absolute inset-0 bg-black/60"
        aria-label="Close modal"
      />
      <div className="relative w-full max-w-[560px] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <div className="font-[var(--font-display)] text-base font-bold tracking-[-0.02em]">
              {props.title}
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Esc
          </button>
        </div>
        <div className="pt-3">{props.children}</div>
      </div>
    </div>
  );
}

export function Header() {
  const apiKeyModalOpen = useUiStore((s) => s.apiKeyModalOpen);
  const setApiKeyModalOpen = useUiStore((s) => s.setApiKeyModalOpen);
  const setQuickCaptureOpen = useUiStore((s) => s.setQuickCaptureOpen);

  const [draftKey, setDraftKey] = useState("");

  return (
    <>
      <header className="sticky top-0 z-[100] border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                to="/projects"
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                activeProps={{ className: "bg-[var(--bg-tertiary)] text-[var(--text-primary)]" }}
              >
                Projects
              </Link>
              <Link
                to="/review"
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                activeProps={{ className: "bg-[var(--bg-tertiary)] text-[var(--text-primary)]" }}
              >
                Review
              </Link>
              <Link
                to="/history"
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                activeProps={{ className: "bg-[var(--bg-tertiary)] text-[var(--text-primary)]" }}
              >
                History
              </Link>
              <Link
                to="/settings"
                className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                activeProps={{ className: "bg-[var(--bg-tertiary)] text-[var(--text-primary)]" }}
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickCaptureOpen(true)}
              className="hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-[var(--border-medium)] md:inline-flex"
            >
              Capture
            </button>
            <button
              onClick={() => setQuickCaptureOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]"
              title="Quick capture (Cmd+K / Ctrl+K)"
              aria-label="Quick capture"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M16.4 16.4 21 21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              onClick={() => setApiKeyModalOpen(true)}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]"
              title="Set API key"
            >
              API key
            </button>
            <button
              onClick={() => {
                setApiKey("");
                toast.message("Logged out");
              }}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]"
              title="Log out"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <ModalShell title="API Key" open={apiKeyModalOpen} onClose={() => setApiKeyModalOpen(false)}>
        <div className="text-sm text-[var(--text-secondary)]">
          Stored in localStorage. Required for authenticated API calls.
        </div>
        <div className="mt-3 grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Bearer token
          </label>
          <input
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="pm_test_..."
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-medium)]"
          />
          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              onClick={() => {
                setApiKey("");
                setDraftKey("");
                toast.message("API key cleared");
              }}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Clear
            </button>
            <button
              onClick={() => {
                setApiKey(draftKey.trim());
                toast.success("API key saved");
                setApiKeyModalOpen(false);
              }}
              className="rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--accent-decision)_24%,transparent)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-decision)_30%,transparent)]"
            >
              Save
            </button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
