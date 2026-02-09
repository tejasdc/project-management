import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { NoteSource } from "@pm/shared";
import { api, unwrapJson } from "../lib/api-client";
import { useUiStore } from "../stores/ui";
import { Dialog, DialogContent } from "./ui/Dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CaptureResponse = { note: { id: string; capturedAt: string }; deduped: boolean };

type RawNote = {
  id: string;
  content: string;
  source: string;
  processed: boolean;
  processedAt: string | null;
  capturedAt: string;
};

// ---------------------------------------------------------------------------
// Source options - map display labels to API enum values
// ---------------------------------------------------------------------------

const SOURCE_OPTIONS: { label: string; value: NoteSource }[] = [
  { label: "web", value: "api" },
  { label: "cli", value: "cli" },
  { label: "slack", value: "slack" },
  { label: "meeting", value: "meeting_transcript" },
  { label: "voice memo", value: "voice_memo" },
  { label: "obsidian", value: "obsidian" },
  { label: "mcp", value: "mcp" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

function sourceLabel(apiValue: string): string {
  const found = SOURCE_OPTIONS.find((s) => s.value === apiValue);
  return found?.label ?? apiValue;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CaptureIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span className="inline-flex animate-[checkmark-pop_0.3s_cubic-bezier(0.16,1,0.3,1)_both]">
      &#10003;
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-[10px] w-[10px] rounded-full border-[1.5px] border-[rgba(16,185,129,0.25)] border-t-[var(--accent-insight)] animate-spin"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Entity pill component
// ---------------------------------------------------------------------------

const ENTITY_PILL_STYLES: Record<string, string> = {
  task: "text-[var(--accent-task)] bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.2)]",
  decision:
    "text-[var(--accent-decision)] bg-[rgba(59,130,246,0.12)] border-[rgba(59,130,246,0.2)]",
  insight:
    "text-[var(--accent-insight)] bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.2)]",
};

function EntityPill({ type }: { type: string }) {
  const style = ENTITY_PILL_STYLES[type] ?? ENTITY_PILL_STYLES.task;
  return (
    <span
      className={[
        "inline-flex items-center font-mono text-[10px] font-medium capitalize px-2 py-[2px] rounded-full border leading-[1.4] tracking-[0.03em]",
        style,
      ].join(" ")}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recent capture item
// ---------------------------------------------------------------------------

function RecentCaptureItem({ note, index }: { note: RawNote; index: number }) {
  const isProcessing = !note.processed;

  return (
    <li
      className="flex items-start justify-between gap-3 px-3 py-[10px] rounded-[var(--radius-sm)] transition-colors duration-150 hover:bg-[var(--bg-tertiary)] animate-[fade-slide-in_0.3s_ease_both]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] leading-[1.5] mb-1 line-clamp-2">
          {note.content}
        </p>
        <div className="flex items-center flex-wrap gap-2">
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
            {relativeTime(note.capturedAt)}
          </span>
          <span
            className="w-[2px] h-[2px] rounded-full bg-[var(--border-medium)]"
            aria-hidden="true"
          />
          {isProcessing ? (
            <span className="inline-flex items-center gap-[5px] font-mono text-[11px] font-medium px-2 py-[2px] rounded-full leading-[1.4] text-[var(--accent-insight)] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.15)]">
              <Spinner />
              Processing&hellip;
            </span>
          ) : (
            <span className="inline-flex items-center gap-[5px] font-mono text-[11px] font-medium px-2 py-[2px] rounded-full leading-[1.4] text-[var(--confidence-high)] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.15)]">
              <CheckIcon />
              Processed
            </span>
          )}
          {/* Entity pills are shown per-note only when processed. Since raw_notes don't carry entity types,
              we show source tag instead, matching standalone mockup style */}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QuickCapture() {
  const open = useUiStore((s) => s.quickCaptureOpen);
  const setOpen = useUiStore((s) => s.setQuickCaptureOpen);
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [source, setSource] = useState<NoteSource>("api");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- Fetch recent captures ----
  const recentNotes = useQuery({
    queryKey: ["notes", { _page: "quickCapture", limit: 3 }],
    queryFn: async () => {
      const res = await api.api.notes.$get({ query: { limit: "3" } });
      return unwrapJson<{ items: RawNote[]; nextCursor: string | null }>(res);
    },
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  // ---- Capture mutation ----
  const capture = useMutation({
    mutationFn: async () => {
      const trimmed = content.trim();
      if (!trimmed) throw new Error("Enter a note.");
      const res = await api.api.notes.capture.$post({
        json: {
          content: trimmed,
          source,
          capturedAt: new Date().toISOString(),
        },
      });
      return unwrapJson<CaptureResponse>(res);
    },
    onSuccess: (data) => {
      toast.success(data.deduped ? "Captured (deduped)" : "Captured", {
        description: `Note ${String(data.note?.id ?? "").slice(0, 8)} saved.`,
      });
      setContent("");
      // Refetch recent captures
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Capture failed");
    },
  });

  // ---- Global keyboard shortcut: Cmd/Ctrl+K to open ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [setOpen]);

  // ---- Auto-focus textarea when dialog opens ----
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  // ---- Cmd/Ctrl+Enter to submit from inside textarea ----
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (content.trim() && !capture.isPending) {
        capture.mutate();
      }
    }
  };

  const isMac = useMemo(() => {
    return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }, []);

  const modKey = isMac ? "\u2318" : "Ctrl+";

  const recentItems = recentNotes.data?.items ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setContent("");
          capture.reset();
        }
      }}
    >
      <DialogContent className="max-w-[580px] p-0 overflow-hidden">
        {/* ── Header ── */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <h2 className="font-[var(--font-display)] text-base font-semibold text-[var(--text-primary)]">
              Quick Capture
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <kbd className="inline-flex items-center justify-center font-mono text-[11px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded px-[6px] py-[2px] min-h-[22px] leading-none">
              {modKey}K
            </kbd>
            <button
              type="button"
              aria-label="Close modal"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-7 h-7 bg-transparent border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[var(--text-tertiary)] text-sm leading-none cursor-pointer transition-all duration-150 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-medium)]"
            >
              &#10005;
            </button>
          </div>
        </header>

        {/* ── Body: Textarea ── */}
        <div className="px-5 py-5">
          <label htmlFor="capture-input-modal" className="sr-only">
            Capture your thought
          </label>
          <textarea
            id="capture-input-modal"
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={5}
            placeholder="Type your thought, idea, or note..."
            className="w-full min-h-[130px] resize-y bg-[var(--bg-quaternary,var(--bg-tertiary))] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-4 py-[14px] font-[var(--font-body)] text-[15px] leading-[1.6] text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-insight)] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.25),inset_0_1px_2px_rgba(0,0,0,0.2)]"
          />
        </div>

        {/* ── Footer ── */}
        <footer className="flex items-center justify-between px-5 py-[14px] border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            {/* Source selector */}
            <div className="relative inline-flex items-center">
              <label htmlFor="source-modal" className="sr-only">
                Source
              </label>
              <select
                id="source-modal"
                value={source}
                onChange={(e) => setSource(e.target.value as NoteSource)}
                className="appearance-none bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[var(--text-secondary)] font-mono text-xs px-[10px] py-[6px] pr-7 cursor-pointer outline-none transition-all duration-150 hover:border-[var(--border-medium)] hover:text-[var(--text-primary)] focus:border-[var(--accent-insight)]"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Dropdown chevron */}
              <span className="absolute right-[10px] top-1/2 -translate-y-1/2 pointer-events-none">
                <span
                  className="block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[var(--text-tertiary)]"
                  aria-hidden="true"
                />
              </span>
            </div>
            <span
              className="w-px h-5 bg-[var(--border-subtle)]"
              aria-hidden="true"
            />
          </div>

          <div className="flex items-center gap-[10px]">
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
              or{" "}
              <kbd className="inline-flex items-center justify-center font-mono text-[11px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded px-[6px] py-[2px] min-h-[22px] leading-none">
                {modKey}Enter
              </kbd>
            </span>
            <button
              type="button"
              disabled={!content.trim() || capture.isPending}
              onClick={() => capture.mutate()}
              className="inline-flex items-center gap-[6px] bg-[var(--accent-insight)] text-white border-none rounded-[var(--radius-sm)] text-[13px] font-semibold px-4 py-2 cursor-pointer transition-all duration-150 tracking-[0.01em] hover:bg-[#0ea571] hover:shadow-[0_2px_8px_rgba(16,185,129,0.3)] hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <CaptureIcon className="w-[14px] h-[14px]" />
              {capture.isPending ? "Capturing..." : "Capture"}
            </button>
          </div>
        </footer>

        {/* ── Recent Captures ── */}
        {recentItems.length > 0 && (
          <section
            className="border-t border-[var(--border-subtle)] px-5 py-4"
            aria-label="Recent captures"
          >
            <h3 className="font-[var(--font-display)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-3">
              Recent Captures
            </h3>
            <ul className="flex flex-col gap-[2px] list-none">
              {recentItems.map((note, i) => (
                <RecentCaptureItem key={note.id} note={note} index={i} />
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
