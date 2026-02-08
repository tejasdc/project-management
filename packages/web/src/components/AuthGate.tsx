import * as React from "react";
import { getApiKey, setApiKey } from "../lib/api-client";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";

type Status = "idle" | "validating" | "error";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = React.useState(() => !!getApiKey());
  const [draft, setDraft] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    function sync() {
      setHasKey(!!getApiKey());
    }
    window.addEventListener("pm_api_key_changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pm_api_key_changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (hasKey) return <>{children}</>;

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;

    setStatus("validating");
    setErrorMsg("");

    const baseUrl = (import.meta as any).env?.VITE_API_URL ?? "";

    try {
      // First check if server is reachable
      const healthRes = await fetch(`${baseUrl}/api/health`);
      if (!healthRes.ok) {
        throw new Error("Server is not reachable");
      }

      // Then verify the key works for authenticated endpoints
      const projectsRes = await fetch(`${baseUrl}/api/projects`, {
        headers: { authorization: `Bearer ${key}` },
      });

      if (projectsRes.status === 401 || projectsRes.status === 403) {
        throw new Error("Invalid API key");
      }

      if (!projectsRes.ok) {
        throw new Error(`Server returned ${projectsRes.status}`);
      }

      // Key is valid — save and unlock the app
      setApiKey(key);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Connection failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm animate-in">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-[var(--font-display)] text-2xl font-extrabold tracking-[-0.02em]">
              PM Agent
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Enter your API key to connect.
            </p>
          </div>

          <form onSubmit={handleConnect} className="flex flex-col gap-3">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="pm_live_..."
              autoFocus
              className="font-mono text-xs"
            />

            {status === "error" && (
              <p className="text-xs text-[var(--confidence-low)]">{errorMsg}</p>
            )}

            <Button type="submit" disabled={!draft.trim() || status === "validating"}>
              {status === "validating" ? "Connecting..." : "Connect"}
            </Button>
          </form>

          <p className="text-center text-xs text-[var(--text-tertiary)]">
            Find your API key in the Render build logs or create one via the API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
