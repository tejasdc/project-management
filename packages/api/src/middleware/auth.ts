import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys } from "../db/schema/index.js";
import { unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { validateApiKey } from "../services/auth.js";

const PUBLIC_PATHS = new Set(["/api/health", "/api/auth/register", "/api/auth/login"]);

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const authHeader = c.req.header("authorization");
  const protocolKey = c.req.path === "/api/live" ? c.req.header("sec-websocket-protocol")?.split(",").map(p => p.trim()).find(p => p.startsWith("pm_live_")) : undefined;
  const auth = authHeader ?? (protocolKey ? `Bearer ${protocolKey}` : undefined);
  if (!auth) throw unauthorized("Missing Authorization header");

  const m = auth.match(/^Bearer\s+(.+)$/i);
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

  db.update(apiKeys).set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, apiKey.id), isNull(apiKeys.revokedAt))).run();

  await next();
};
