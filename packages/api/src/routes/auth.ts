import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema/index.js";
import { notFound } from "../lib/errors.js";
import { generateApiKeyPlaintext, hashApiKey } from "../services/auth.js";

const createApiKeySchema = z.object({
  name: z.string().min(1),
});

const apiKeyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const authRoutes = new Hono<AppEnv>()
  .get("/me", (c) => {
    return c.json({ user: c.get("user") });
  })
  .post(
    "/api-keys",
    zValidator("json", createApiKeySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { name } = c.req.valid("json");
      const user = c.get("user");

      const pepper = process.env.API_KEY_HASH_PEPPER;
      if (!pepper) {
        // Should never happen in production; keeps behavior deterministic in dev.
        throw new Error("API_KEY_HASH_PEPPER is required");
      }

      const plaintextKey = generateApiKeyPlaintext();
      const keyHash = await hashApiKey(plaintextKey, pepper);

      const [row] = await db
        .insert(apiKeys)
        .values({ userId: user.id, name, keyHash })
        .returning({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt });

      return c.json({ apiKey: row, plaintextKey }, 201);
    }
  )
  .get("/api-keys", async (c) => {
    const user = c.get("user");
    const items = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id))
      .orderBy(apiKeys.createdAt);

    return c.json({ items });
  })
  .post(
    "/api-keys/:id/revoke",
    zValidator("param", apiKeyIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const user = c.get("user");

      const [row] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
        .returning({ id: apiKeys.id });

      if (!row) throw notFound("api_key", id);
      return c.json({ ok: true });
    }
  );
