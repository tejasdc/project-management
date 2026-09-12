import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getApiKey, setApiKey } from "../lib/api-client";

export function SseProvider() {
  const qc = useQueryClient();
  useEffect(() => {
    let socket: WebSocket | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    let key = getApiKey();
    function connect() {
      clearTimeout(timeout);
      if (socket) { socket.onclose = null; socket.close(); }
      if (stopped || !key) return;
      const base = (import.meta as any).env?.VITE_API_URL ?? window.location.origin;
      const url = new URL("/api/live", base || window.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const current = new WebSocket(url, ["clarify", key]);
      socket = current;
      current.onmessage = event => {
        if (socket !== current) return;
        let message: { type: string };
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === "ready") attempt = 0;
        // Notifications are invalidations; reconnect always reloads authoritative state.
        void qc.invalidateQueries();
      };
      current.onclose = event => {
        if (socket !== current || stopped || !key) return;
        if (event.code === 4001) {
          setApiKey("");
          qc.clear();
          return;
        }
        timeout = setTimeout(connect, Math.min(20_000, 500 * 2 ** attempt++) + Math.random() * 500);
      };
    }
    function syncKey() {
      const next = getApiKey();
      if (next === key) return;
      key = next;
      attempt = 0;
      qc.clear();
      connect();
    }
    connect();
    window.addEventListener("pm_api_key_changed", syncKey);
    window.addEventListener("storage", syncKey);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      if (socket) { socket.onclose = null; socket.close(); }
      window.removeEventListener("pm_api_key_changed", syncKey);
      window.removeEventListener("storage", syncKey);
    };
  }, [qc]);
  return null;
}
