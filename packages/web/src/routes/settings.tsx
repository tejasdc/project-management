import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api, unwrapJson } from "../lib/api-client";
import { qk } from "../lib/query-keys";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader } from "../components/ui/Card";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/Dialog";
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

const createAnyFileRoute = createFileRoute as any;

export const Route = createAnyFileRoute("/settings")({
  component: SettingsPage,
  errorComponent: RouteError,
});

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

function isRevoked(k: ApiKeyItem) {
  return Boolean(k.revokedAt);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.message("Copy failed");
  }
}

function SettingsPage() {
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
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return items;
  }, [keys.data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null);

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.api.auth["api-keys"].$post({ json: { name } });
      return unwrapJson<{ apiKey: Pick<ApiKeyItem, "id" | "name" | "createdAt">; plaintextKey: string }>(res);
    },
    onSuccess: async (data) => {
      setPlaintextKey(data.plaintextKey);
      await qc.invalidateQueries({ queryKey: qk.apiKeys() });
      toast.success("API key created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create API key"),
  });

  const [revokeId, setRevokeId] = useState<string | null>(null);
  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.auth["api-keys"][":id"].revoke.$post({ param: { id } as any });
      return unwrapJson<{ ok: true }>(res);
    },
    onSuccess: async () => {
      setRevokeId(null);
      await qc.invalidateQueries({ queryKey: qk.apiKeys() });
      toast.success("API key revoked");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to revoke API key"),
  });

  return (
    <div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--bg-secondary)_92%,black),color-mix(in_oklab,var(--bg-tertiary)_92%,black))] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[-0.03em]">
          Settings
        </div>
        <div className="mt-1 max-w-[80ch] text-sm text-[var(--text-secondary)]">
          Manage API keys used for authenticated calls.
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
                  API keys
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  Keys are shown without plaintext after creation.
                </div>
              </div>
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
                  <Button variant="secondary" size="sm">
                    Create new key
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[560px]">
                  <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                  </DialogHeader>
                  {plaintextKey ? (
                    <div className="space-y-3">
                      <div className="text-sm text-[var(--text-secondary)]">
                        This plaintext key is shown once. Copy it now.
                      </div>
                      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                        <div className="font-mono text-xs text-[var(--text-primary)] break-all">
                          {plaintextKey}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => copyToClipboard(plaintextKey)}>
                          Copy
                        </Button>
                        <DialogClose asChild>
                          <Button size="sm">Done</Button>
                        </DialogClose>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-[var(--text-secondary)]">
                        Name the key so you can recognize it later.
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                          Name
                        </label>
                        <Input
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="e.g. Personal laptop"
                        />
                      </div>
                      <DialogFooter className="flex items-center justify-end gap-2">
                        <DialogClose asChild>
                          <Button variant="ghost" size="sm">
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button
                          size="sm"
                          disabled={!newKeyName.trim() || createKey.isPending}
                          onClick={() => createKey.mutate(newKeyName.trim())}
                        >
                          {createKey.isPending ? "Creating..." : "Create"}
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {keys.isLoading ? (
              <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
            ) : keys.isError ? (
              <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--confidence-low)_28%,var(--border-subtle))] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-secondary)]">
                <div>{(keys.error as any)?.message ?? "Failed to load API keys."}</div>
                <button
                  onClick={() => keys.refetch()}
                  className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-medium)]"
                >
                  Retry
                </button>
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-sm text-[var(--text-secondary)]">No keys yet.</div>
            ) : (
              <div className="space-y-2">
                {sorted.map((k) => {
                  const revoked = isRevoked(k);
                  return (
                    <div
                      key={k.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {k.name}
                          </div>
                          {revoked ? (
                            <Badge variant="danger">Revoked</Badge>
                          ) : (
                            <Badge variant="muted">Active</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] text-[var(--text-tertiary)]">
                          <span>created {formatDate(k.createdAt)}</span>
                          <span>last used {formatDate(k.lastUsedAt)}</span>
                          <span>id {k.id.slice(0, 8)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(k.id)} title="Copy ID">
                          Copy ID
                        </Button>

                        <Dialog open={revokeId === k.id} onOpenChange={(open) => setRevokeId(open ? k.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="danger" size="sm" disabled={revoked}>
                              Revoke
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[520px]">
                            <DialogHeader>
                              <DialogTitle>Revoke API key?</DialogTitle>
                            </DialogHeader>
                            <div className="text-sm text-[var(--text-secondary)]">
                              This action cannot be undone. Calls using this key will start failing.
                            </div>
                            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
                              <div className="text-xs font-semibold text-[var(--text-primary)]">{k.name}</div>
                              <div className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{k.id}</div>
                            </div>
                            <DialogFooter className="mt-4 flex items-center justify-end gap-2">
                              <DialogClose asChild>
                                <Button variant="ghost" size="sm">
                                  Cancel
                                </Button>
                              </DialogClose>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={revokeKey.isPending}
                                onClick={() => revokeKey.mutate(k.id)}
                              >
                                {revokeKey.isPending ? "Revoking..." : "Revoke"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="font-[var(--font-display)] text-base font-extrabold tracking-[-0.02em]">
              Usage
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-[var(--text-secondary)]">
              API keys authenticate requests to the backend API. You can set a key in the header modal, or generate a new one here.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
