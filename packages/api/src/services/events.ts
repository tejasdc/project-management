import { EventEmitter } from "node:events";
import IORedis from "ioredis";

const CHANNEL = "pm:sse";

export type SseEvent = {
  type: string;
  ts: string;
  data: unknown;
};

let pub: IORedis | null = null;
let sub: IORedis | null = null;
let wired = false;

export const events = new EventEmitter();

function getRedisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for SSE events");
  return url;
}

function ensureWired() {
  if (wired) return;
  wired = true;

  pub = new IORedis(getRedisUrl(), { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });
  sub = new IORedis(getRedisUrl(), { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });

  sub.on("message", (_channel, message) => {
    try {
      const evt = JSON.parse(message) as SseEvent;
      events.emit("event", evt);
    } catch {
      // ignore
    }
  });

  void sub.subscribe(CHANNEL);
}

export async function publishEvent(type: string, data: unknown) {
  ensureWired();
  const evt: SseEvent = { type, ts: new Date().toISOString(), data };
  await pub!.publish(CHANNEL, JSON.stringify(evt));
}

// Best-effort publisher for non-critical paths (jobs/routes).
// SSE is additive; we should not fail the primary request/job if Redis is absent or down.
export async function tryPublishEvent(type: string, data: unknown) {
  try {
    if (!process.env.REDIS_URL) return;
    await publishEvent(type, data);
  } catch {
    // ignore
  }
}

export function onEvent(fn: (evt: SseEvent) => void) {
  ensureWired();
  events.on("event", fn);
  return () => events.off("event", fn);
}
