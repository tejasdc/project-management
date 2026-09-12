import type { MiddlewareHandler } from "hono";
import { eq, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimits } from "../db/schema/index.js";

function limiter(prefix: string, windowMs: number, limit: number, failedOnly: boolean): MiddlewareHandler {
  return async (c, next) => {
    const key = prefix + (failedOnly ? c.req.header("cf-connecting-ip") ?? "local" : c.get("apiKey")?.id ?? "local");
    const now = Date.now();
    db.delete(rateLimits).where(lte(rateLimits.expiresAt, now)).run();
    const previous = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
    if (previous && previous.count >= limit) {
      const retryAfter = Math.ceil((previous.expiresAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests", status: 429, retryAfter } }, 429);
    }
    function recordAttempt() {
      const recordedAt = Date.now();
      const row = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();
      const active = row && row.expiresAt > recordedAt;
      const values = { count: active ? row.count + 1 : 1, expiresAt: active ? row.expiresAt : recordedAt + windowMs };
      db.insert(rateLimits).values({ key, ...values })
        .onConflictDoUpdate({ target: rateLimits.key, set: values }).run();
    }
    if (!failedOnly) recordAttempt();
    await next();
    if (failedOnly && c.res.status === 401) recordAttempt();
  };
}
export const tier1IpAuthFailLimiter = limiter("auth:", 15 * 60 * 1000, 20, true);
export const tier2ApiKeyCaptureLimiter = limiter("capture:", 60 * 1000, 30, false);
