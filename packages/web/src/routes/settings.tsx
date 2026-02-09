import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { Button } from "../components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { RouteError } from "./__root";

type ApiKeyItem = {
  id: string;
  userId: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type SettingsTab = "api-keys" | "profile" | "preferences";

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/settings")({
  component: SettingsPage,
  errorComponent: RouteError,
});

/* ---------- Date formatting helpers ---------- */

function formatShortDate(s: string | null | undefined): string {
  if (!s) return "\u2014";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return formatShortDate(s);

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatShortDate(s);
}

function isRevoked(k: ApiKeyItem) {
  return Boolean(k.revokedAt);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.message("Copy failed");
  }
}

/* ---------- Clipboard icon (inline SVG) ---------- */

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5" />
    </svg>
  );
}

/* ============================================
   Main Settings Page
   ============================================ */

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("api-keys");

  return (
    <div>
      {/* Page Header */}
      <header className="mb-8 animate-[fadeInUp_0.4s_ease]">
        <h1 className="font-[var(--font-display)] text-[1.75rem] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
          Settings
        </h1>
      </header>

      {/* Tabs */}
      <div
        className="mb-9 flex gap-0 border-b border-[var(--border-subtle)] animate-[fadeInUp_0.4s_ease_0.05s_both]"
        role="tablist"
      >
        {(
          [
            { id: "api-keys", label: "API Keys" },
            { id: "profile", label: "Profile" },
            { id: "preferences", label: "Preferences" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "relative px-5 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "text-[var(--accent-insight)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-[-1px] left-0 h-[2px] w-full rounded-t bg-[var(--accent-insight)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "api-keys" && <ApiKeysTab />}
      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "preferences" && <PreferencesTab />}
    </div>
  );
}

/* ============================================
   API Keys Tab
   ============================================ */

function ApiKeysTab() {
  const qc = useQueryClient();

  const keys = useQuery({
    queryKey: qk.apiKeys(),
    queryFn: async () => {
      const res = await api.api.auth["api-keys"].$get();
      return unwrapJson<{ items: ApiKeyItem[] }>(res);
    },
  });

  const sorted = useMemo(() => {
    const items = (keys.data?.items ?? []).slice();
    items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return items;
  }, [keys.data]);

  /* --- Create key state --- */
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null);

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.api.auth["api-keys"].$post({ json: { name } });
      return unwrapJson<{
        apiKey: Pick<ApiKeyItem, "id" | "name" | "createdAt">;
        plaintextKey: string;
      }>(res);
    },
    onSuccess: async (data) => {
      setPlaintextKey(data.plaintextKey);
      await qc.invalidateQueries({ queryKey: qk.apiKeys() });
      toast.success("API key created");
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to create API key"
      ),
  });

  /* --- Revoke key state --- */
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.auth["api-keys"][":id"].revoke.$post({
        param: { id } as any,
      });
      return unwrapJson<{ ok: true }>(res);
    },
    onSuccess: async () => {
      setRevokeTarget(null);
      await qc.invalidateQueries({ queryKey: qk.apiKeys() });
      toast.success("API key revoked");
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke API key"
      ),
  });

  return (
    <>
      {/* Section Header */}
      <div className="mb-6 flex items-start justify-between animate-[fadeInUp_0.4s_ease_0.1s_both]">
        <div className="flex-1">
          <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.01em] text-[var(--text-primary)] mb-1.5">
            API Keys
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-[560px]">
            API keys authenticate CLI tools, MCP servers, and other
            integrations. Keep your keys secret.
          </p>
        </div>

        {/* Create Key Dialog */}
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              setNewKeyName("");
              setPlaintextKey(null);
              createKey.reset();
            }
          }}
        >
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-insight)] px-[18px] py-2.5 text-[0.8125rem] font-medium text-white transition-all hover:bg-[#0ea472] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <span className="text-base font-semibold leading-none">+</span>
              Create New Key
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[520px]">
            {plaintextKey ? (
              /* ---- Key Created State (warning-style) ---- */
              <>
                <DialogHeader>
                  <DialogTitle>API Key Created</DialogTitle>
                </DialogHeader>
                <div className="mt-3 space-y-4">
                  {/* Key display */}
                  <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-medium)] bg-[var(--bg-primary)] px-[18px] py-3.5">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[0.9rem] font-medium text-[var(--accent-insight)] tracking-wide">
                      {plaintextKey}
                    </span>
                    <button
                      onClick={() => copyToClipboard(plaintextKey)}
                      className="inline-flex shrink-0 items-center gap-[5px] rounded-[var(--radius-sm)] border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--text-tertiary)] hover:bg-[var(--bg-quaternary,#232836)] hover:text-[var(--text-primary)]"
                    >
                      <ClipboardIcon className="h-3.5 w-3.5" />
                      Copy to Clipboard
                    </button>
                  </div>

                  {/* Warning callout */}
                  <div className="rounded-[var(--radius-md)] border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.06)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--accent-task)]">
                    <strong className="font-semibold">Warning:</strong> This key
                    will only be shown <strong className="font-semibold">once</strong>.
                    Copy it now and store it securely. If you lose it, you'll
                    need to create a new one.
                  </div>

                  {/* Usage examples */}
                  <div>
                    <p className="mb-3 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                      Usage Examples
                    </p>

                    <div className="space-y-3">
                      <UsageExample
                        label="CLI"
                        code={`export PM_API_KEY="${plaintextKey.slice(0, 12)}..."`}
                      />
                      <UsageExample
                        label="MCP Config"
                        code={`{ "env": { "PM_API_KEY": "${plaintextKey.slice(0, 12)}..." } }`}
                      />
                      <UsageExample
                        label="HTTP"
                        code={`Authorization: Bearer ${plaintextKey.slice(0, 12)}...`}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4 bg-[rgba(19,22,31,0.5)] -mx-4 -mb-4 px-4 pb-4 rounded-b-[var(--radius-lg)]">
                  <DialogClose asChild>
                    <button className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-insight)] px-[18px] py-2.5 text-[0.8125rem] font-medium text-white transition-all hover:bg-[#0ea472] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                      Done
                    </button>
                  </DialogClose>
                </DialogFooter>
              </>
            ) : (
              /* ---- Create Key Form State ---- */
              <>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                </DialogHeader>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                      Key Name
                    </label>
                    <Input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., cli-laptop, mcp-server"
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          newKeyName.trim() &&
                          !createKey.isPending
                        ) {
                          createKey.mutate(newKeyName.trim());
                        }
                      }}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-4 flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4 bg-[rgba(19,22,31,0.5)] -mx-4 -mb-4 px-4 pb-4 rounded-b-[var(--radius-lg)]">
                  <DialogClose asChild>
                    <Button variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </DialogClose>
                  <button
                    disabled={!newKeyName.trim() || createKey.isPending}
                    onClick={() => createKey.mutate(newKeyName.trim())}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-insight)] px-[18px] py-2.5 text-[0.8125rem] font-medium text-white transition-all hover:bg-[#0ea472] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {createKey.isPending ? "Creating..." : "Create Key"}
                  </button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* API Keys Table */}
      {keys.isLoading ? (
        <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
          Loading API keys...
        </div>
      ) : keys.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
          <div>
            {(keys.error as any)?.message ?? "Failed to load API keys."}
          </div>
          <button
            onClick={() => keys.refetch()}
            className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
          >
            Retry
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-16 text-center animate-[fadeInUp_0.4s_ease_0.15s_both]">
          <div className="text-sm text-[var(--text-tertiary)]">
            No API keys yet. Create one to get started.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] animate-[fadeInUp_0.4s_ease_0.15s_both]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Name", "Key Prefix", "Created", "Last Used", "Actions"].map(
                  (header) => (
                    <th
                      key={header}
                      scope="col"
                      className="bg-[var(--bg-secondary)] px-5 py-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((k, idx) => {
                const revoked = isRevoked(k);
                return (
                  <tr
                    key={k.id}
                    className={[
                      "transition-colors",
                      revoked
                        ? "opacity-50"
                        : "hover:bg-[var(--bg-tertiary)]",
                      idx % 2 === 0
                        ? "bg-[var(--bg-secondary)]"
                        : "bg-[rgba(26,30,42,0.4)]",
                    ].join(" ")}
                  >
                    <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-sm">
                      <span
                        className={[
                          "font-medium",
                          revoked
                            ? "line-through text-[var(--text-tertiary)]"
                            : "text-[var(--text-primary)]",
                        ].join(" ")}
                      >
                        {k.name}
                      </span>
                    </td>
                    <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-sm">
                      <span className="font-mono text-[0.8125rem] text-[var(--text-secondary)]">
                        {k.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="border-b border-[var(--border-subtle)] px-5 py-3.5">
                      <span className="text-[0.8125rem] text-[var(--text-secondary)]">
                        {formatShortDate(k.createdAt)}
                      </span>
                    </td>
                    <td className="border-b border-[var(--border-subtle)] px-5 py-3.5">
                      {k.lastUsedAt ? (
                        <span className="text-[0.8125rem] text-[var(--text-secondary)]">
                          {formatRelativeTime(k.lastUsedAt)}
                        </span>
                      ) : (
                        <span className="text-[0.8125rem] italic text-[var(--text-tertiary)]">
                          Never
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[var(--border-subtle)] px-5 py-3.5">
                      {revoked ? (
                        <span className="text-xs italic text-[var(--text-tertiary)]">
                          Revoked
                        </span>
                      ) : (
                        <button
                          onClick={() => setRevokeTarget(k)}
                          className="rounded-[var(--radius-md)] border border-[var(--action-reject)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--action-reject)] transition-all hover:bg-[var(--action-reject)] hover:text-white"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
          </DialogHeader>
          <div className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            Are you sure you want to revoke the key{" "}
            <strong className="font-medium text-[var(--text-primary)]">
              '{revokeTarget?.name}'
            </strong>
            ? Any tools or integrations using this key will immediately lose
            access.
          </div>
          <DialogFooter className="mt-4 flex items-center justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4 bg-[rgba(19,22,31,0.5)] -mx-4 -mb-4 px-4 pb-4 rounded-b-[var(--radius-lg)]">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <button
              disabled={revokeKey.isPending}
              onClick={() => revokeTarget && revokeKey.mutate(revokeTarget.id)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--action-reject)] px-[18px] py-2.5 text-[0.8125rem] font-medium text-white transition-all hover:bg-[#dc2626] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revokeKey.isPending ? "Revoking..." : "Revoke Key"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============================================
   Usage Example component (for Key Created dialog)
   ============================================ */

function UsageExample({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {label}
      </div>
      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-quaternary,#232836)] px-[18px] py-3.5 font-mono text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
        <code>{code}</code>
      </div>
    </div>
  );
}

/* ============================================
   Profile Tab (placeholder)
   ============================================ */

function ProfileTab() {
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await api.api.auth.me.$get();
      return unwrapJson<{ user: { id: string; name: string; email: string } }>(
        res
      );
    },
  });

  return (
    <div className="animate-[fadeInUp_0.4s_ease_0.1s_both]">
      <div className="mb-6">
        <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.01em] text-[var(--text-primary)] mb-1.5">
          Profile
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-[560px]">
          Your account information.
        </p>
      </div>

      <div className="max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {me.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-secondary)]">
            Loading profile...
          </div>
        ) : me.isError ? (
          <div className="p-6 text-sm text-[var(--text-secondary)]">
            Failed to load profile.
          </div>
        ) : me.data ? (
          <table className="w-full border-collapse">
            <tbody>
              <tr className="bg-[var(--bg-secondary)]">
                <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-[0.8125rem] font-medium text-[var(--text-tertiary)] w-32">
                  Name
                </td>
                <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-sm text-[var(--text-primary)]">
                  {me.data.user.name}
                </td>
              </tr>
              <tr className="bg-[rgba(26,30,42,0.4)]">
                <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-[0.8125rem] font-medium text-[var(--text-tertiary)]">
                  Email
                </td>
                <td className="border-b border-[var(--border-subtle)] px-5 py-3.5 text-sm text-[var(--text-primary)]">
                  {me.data.user.email}
                </td>
              </tr>
              <tr className="bg-[var(--bg-secondary)]">
                <td className="px-5 py-3.5 text-[0.8125rem] font-medium text-[var(--text-tertiary)]">
                  User ID
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-[var(--text-secondary)]">
                  {me.data.user.id}
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

/* ============================================
   Preferences Tab (placeholder)
   ============================================ */

function PreferencesTab() {
  return (
    <div className="animate-[fadeInUp_0.4s_ease_0.1s_both]">
      <div className="mb-6">
        <h2 className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.01em] text-[var(--text-primary)] mb-1.5">
          Preferences
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-[560px]">
          Customize your experience. More settings coming soon.
        </p>
      </div>

      <div className="max-w-lg rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-16 text-center">
        <div className="text-sm text-[var(--text-tertiary)]">
          No preferences available yet.
        </div>
      </div>
    </div>
  );
}
