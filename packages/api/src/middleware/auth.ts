import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema/index.js";
import { unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { validateApiKey } from "../services/auth.js";

const PUBLIC_PATHS = new Set(["/api/health"]);

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const authHeader = c.req.header("authorization");
  const sseApiKey = c.req.path.startsWith("/api/sse") ? (c.req.query("apiKey") ?? c.req.query("api_key") ?? "") : "";
  const auth = authHeader || (sseApiKey ? `Bearer ${sseApiKey}` : "");
  if (!auth) throw unauthorized("Missing Authorization header");

  const m = auth.match(/^Bearer\\s+(.+)$/i);
  if (!m) throw unauthorized("Invalid Authorization header format");

  const plaintextKey = m[1]!.trim();
  const validated = await validateApiKey(plaintextKey);
  if (!validated) throw unauthorized("Invalid API key");
  const { apiKey, user } = validated;

  // Attach to context for downstream handlers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.set("user" as any, user);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.set("apiKey" as any, apiKey);

  // Non-blocking last_used_at update (fire-and-forget).
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, apiKey.id), isNull(apiKeys.revokedAt)))
    .catch((err) => logger.warn({ err }, "Failed to update api_keys.last_used_at"));

  await next();
};
