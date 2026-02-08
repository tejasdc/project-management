import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api, unwrapJson } from "../lib/api-client";
import { useUiStore } from "../stores/ui";
import { Button } from "./ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from "./ui/Dialog";
import { Textarea } from "./ui/Textarea";

type CaptureResponse = { note: { id: string; capturedAt: string }; deduped: boolean };

function buildApiNoteLink(capturedAt: string) {
  const t = new Date(capturedAt).getTime();
  if (Number.isNaN(t)) return "/api/notes?limit=10";
  const since = new Date(t - 10_000).toISOString();
  const until = new Date(t + 10_000).toISOString();
  return `/api/notes?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=10`;
}

export function QuickCapture() {
  const open = useUiStore((s) => s.quickCaptureOpen);
  const setOpen = useUiStore((s) => s.setQuickCaptureOpen);

  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const capture = useMutation({
    mutationFn: async () => {
      const trimmed = content.trim();
      if (!trimmed) throw new Error("Enter a note.");
      const res = await api.api.notes.capture.$post({
        json: {
          content: trimmed,
          source: "api",
          capturedAt: new Date().toISOString(),
        },
      });
      return unwrapJson<CaptureResponse>(res);
    },
    onSuccess: (data) => {
      const href = buildApiNoteLink(String(data.note?.capturedAt ?? ""));
      toast.success(data.deduped ? "Captured (deduped)" : "Captured", {
        description: (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-[var(--text-secondary)] underline decoration-[color-mix(in_oklab,var(--border-subtle)_65%,transparent)] underline-offset-2 hover:text-[var(--text-primary)]"
          >
            View note {String(data.note?.id ?? "").slice(0, 8)}
          </a>
        ),
      });
      setContent("");
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Capture failed");
    },
  });

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

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [open]);

  const shortcut = useMemo(() => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    return isMac ? "Cmd+K" : "Ctrl+K";
  }, []);

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
        <div className="border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Quick capture</DialogTitle>
            <div className="font-mono text-[10px] text-[var(--text-tertiary)]">
              {shortcut}
            </div>
          </div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            Capture thoughts, ideas, and notes. AI will extract tasks, decisions, and insights.
          </div>
        </div>

        <div className="px-5 py-4">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Note
          </label>
          <div className="mt-2">
            <Textarea
              ref={textareaRef as any}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder="Type your thought, idea, or note..."
              className="bg-[var(--bg-primary)]"
            />
          </div>
          <div className="mt-3 text-[11px] text-[var(--text-tertiary)]">
            Tip: Use short bullets. Include decisions and owners.
          </div>
        </div>

        <DialogFooter className="border-t border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={!content.trim() || capture.isPending}
              onClick={() => capture.mutate()}
            >
              {capture.isPending ? "Capturing..." : "Capture"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
