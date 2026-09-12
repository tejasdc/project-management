import { getRuntime } from "../runtime.js";
export type SseEvent = { type: string; ts: string; data: unknown };
export async function publishEvent(type: string, data: unknown) {
  getRuntime().broadcast({ type, ts: new Date().toISOString(), data });
}
export const tryPublishEvent = publishEvent;
