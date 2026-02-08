import * as React from "react";
import { getApiKey, setApiKey } from "../lib/api-client";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";

type Status = "idle" | "validating" | "error";
type Mode = "login" | "register";

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? "";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = React.useState(() => !!getApiKey());
  const [mode, setMode] = React.useState<Mode>("register");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  // Login fields
  const [draft, setDraft] = React.useState("");

  // Register fields
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");

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

  function switchMode(next: Mode) {
    setMode(next);
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;

    setStatus("validating");
    setErrorMsg("");

    try {
      const projectsRes = await fetch(`${BASE_URL}/api/projects`, {
        headers: { authorization: `Bearer ${key}` },
      });

      if (projectsRes.status === 401 || projectsRes.status === 403) {
        throw new Error("Invalid API key");
      }
      if (!projectsRes.ok) {
        throw new Error(`Server returned ${projectsRes.status}`);
      }

      setApiKey(key);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setStatus("validating");
    setErrorMsg("");

    try {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error?.message ?? `Server returned ${res.status}`);
      }

      setApiKey(json.apiKey);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Registration failed");
    }
  }

  const tabClass = (active: boolean) =>
    [
      "flex-1 pb-2 text-sm font-semibold transition-colors",
      active
        ? "text-[var(--text-primary)] border-b-2 border-[var(--accent-task)]"
        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
    ].join(" ");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm animate-in">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-[var(--font-display)] text-2xl font-extrabold tracking-[-0.02em]">
              PM Agent
            </h1>
          </div>

          <div className="flex gap-4 border-b border-[var(--border-subtle)]">
            <button type="button" className={tabClass(mode === "register")} onClick={() => switchMode("register")}>
              Create Account
            </button>
            <button type="button" className={tabClass(mode === "login")} onClick={() => switchMode("login")}>
              Use API Key
            </button>
          </div>

          {mode === "register" ? (
            <form onSubmit={handleRegister} className="flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
              />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
              />

              {status === "error" && (
                <p className="text-xs text-[var(--confidence-low)]">{errorMsg}</p>
              )}

              <Button type="submit" disabled={!name.trim() || !email.trim() || status === "validating"}>
                {status === "validating" ? "Creating..." : "Create Account"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
