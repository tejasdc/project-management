import type { MiddlewareHandler } from "hono";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema/index.js";
import { unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { hashApiKey } from "../services/auth.js";

const PUBLIC_PATHS = new Set(["/api/health", "/api/mcp"]);

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const auth = c.req.header("authorization");
  if (!auth) throw unauthorized("Missing Authorization header");

  const m = auth.match(/^Bearer\\s+(.+)$/i);
  if (!m) throw unauthorized("Invalid Authorization header format");

  const plaintextKey = m[1]!.trim();
  const pepper = process.env.API_KEY_HASH_PEPPER;
  if (!pepper) {
    // Misconfiguration: treat as 401 to avoid leaking server state.
    throw unauthorized("Invalid API key");
  }

  const keyHash = await hashApiKey(plaintextKey, pepper);
  const apiKey = await db.query.apiKeys.findFirst({
    where: (t, { and, eq, isNull }) =>
      and(eq(t.keyHash, keyHash), isNull(t.revokedAt)),
  });

  if (!apiKey) throw unauthorized("Invalid API key");

  const user = await db.query.users.findFirst({
    where: (t, { eq }) => eq(t.id, apiKey.userId),
  });

  if (!user) throw unauthorized("Invalid API key");

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

