import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { AppEnv } from "../types/env.js";
import { onEvent } from "../services/events.js";

export const sseRoutes = new Hono<AppEnv>().get("/", (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "ready",
      data: JSON.stringify({ ts: new Date().toISOString() }),
    });

    const off = onEvent((evt) => {
      void stream.writeSSE({
        event: evt.type,
        data: JSON.stringify({ ts: evt.ts, data: evt.data }),
      });
    });

    const keepalive = setInterval(() => {
      void stream.writeSSE({
        event: "ping",
        data: JSON.stringify({ ts: new Date().toISOString() }),
      });
    }, 25_000);

    stream.onAbort(() => {
      clearInterval(keepalive);
      off();
    });
  });
});

