import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getApiKey } from "../lib/api-client";

function getSseUrl(apiKey: string) {
  const base = (import.meta as any).env?.VITE_API_URL ?? "";
  const path = "/api/sse";
  const url = base ? `${base.replace(/\/$/, "")}${path}` : path;
  const u = new URL(url, window.location.origin);
  if (apiKey) u.searchParams.set("apiKey", apiKey);
  return u.toString();
}

export function SseProvider() {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const backoffRef = useRef({ attempt: 0, timeoutId: 0 as unknown as number });

  useEffect(() => {
    let apiKey = getApiKey();
    if (!apiKey) return;

    let closed = false;

    const scheduleReconnect = () => {
      if (closed) return;
      const attempt = backoffRef.current.attempt + 1;
      backoffRef.current.attempt = attempt;

      const base = 500; // ms
      const max = 20_000; // ms
      const delay = Math.min(max, base * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(750, delay));

      clearTimeout(backoffRef.current.timeoutId);
      backoffRef.current.timeoutId = window.setTimeout(() => {
        if (closed) return;
        connect();
      }, delay + jitter);
    };

    const invalidateForEvent = (eventType: string, payload: any) => {
      // Prefer broad invalidations; keeps logic robust as UI evolves.
      if (eventType.startsWith("review_queue:")) {
        void qc.invalidateQueries({ queryKey: ["reviewQueue"] });
        return;
      }

      if (eventType === "entity:created" || eventType === "entity:updated") {
        void qc.invalidateQueries({ queryKey: ["entities"] });
        void qc.invalidateQueries({ queryKey: ["projects"] });
        if (payload?.data?.id) {
          void qc.invalidateQueries({ queryKey: ["entities", payload.data.id] });
        }
        return;
      }

      if (eventType === "entity:event_added") {
        const entityId = payload?.data?.entityId;
        if (entityId) {
          void qc.invalidateQueries({ queryKey: ["entities", entityId, "events"] });
          void qc.invalidateQueries({ queryKey: ["entities", entityId] });
        }
        return;
      }

      if (eventType === "raw_note:processed") {
        void qc.invalidateQueries({ queryKey: ["notes"] });
        return;
      }

      if (eventType === "project:stats_updated") {
        void qc.invalidateQueries({ queryKey: ["projects"] });
        const projectId = payload?.data?.projectId;
        if (projectId) void qc.invalidateQueries({ queryKey: ["projects", projectId, "dashboard"] });
        return;
      }

      if (eventType === "project:created" || eventType === "project:updated") {
        void qc.invalidateQueries({ queryKey: ["projects"] });
        const projectId = payload?.data?.id ?? payload?.data?.projectId;
        if (projectId) {
          void qc.invalidateQueries({ queryKey: ["projects", projectId] });
        }
        return;
      }

      if (eventType === "epic:created" || eventType === "epic:updated") {
        void qc.invalidateQueries({ queryKey: ["projects"] });
        void qc.invalidateQueries({ queryKey: ["epics"] });
        const projectId = payload?.data?.projectId;
        if (projectId) {
          void qc.invalidateQueries({ queryKey: ["projects", projectId] });
        }
        return;
      }

      if (eventType === "raw_note:created") {
        void qc.invalidateQueries({ queryKey: ["notes"] });
        return;
      }
    };

    const connect = () => {
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }

      const es = new EventSource(getSseUrl(apiKey));
      esRef.current = es;

      es.addEventListener("ready", () => {
        backoffRef.current.attempt = 0;
      });

      const allEvents = [
        "review_queue:created",
        "review_queue:resolved",
        "entity:created",
        "entity:updated",
        "entity:event_added",
        "raw_note:processed",
        "raw_note:created",
        "project:stats_updated",
        "project:created",
        "project:updated",
        "epic:created",
        "epic:updated",
      ] as const;

      for (const t of allEvents) {
        es.addEventListener(t, (evt) => {
          try {
            const payload = JSON.parse((evt as MessageEvent).data);
            invalidateForEvent(t, payload);
          } catch {
            invalidateForEvent(t, null);
          }
        });
      }

      es.addEventListener("ping", () => {
        // keepalive
      });

      es.onerror = () => {
        // EventSource may auto-reconnect, but we implement explicit exponential backoff.
        try {
          es.close();
        } catch {
          // ignore
        }
        scheduleReconnect();
      };
    };

    connect();

    const onKeyChanged = () => {
      const next = getApiKey();
      if (!next || next === apiKey) return;
      apiKey = next;
      backoffRef.current.attempt = 0;
      connect();
    };
    window.addEventListener("pm_api_key_changed", onKeyChanged);
    window.addEventListener("storage", onKeyChanged);

    return () => {
      closed = true;
      clearTimeout(backoffRef.current.timeoutId);
      try {
        esRef.current?.close();
      } catch {
        // ignore
      }
      esRef.current = null;
      window.removeEventListener("pm_api_key_changed", onKeyChanged);
      window.removeEventListener("storage", onKeyChanged);
    };
  }, [qc]);

  return null;
}
