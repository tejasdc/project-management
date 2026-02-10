import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { apiKeys, users } from "../db/schema/index.js";
import { notFound } from "../lib/errors.js";
import { generateApiKey, hashPassword, verifyPassword } from "../services/auth.js";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

const createApiKeySchema = z.object({
  name: z.string().min(1),
});

const apiKeyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>()
  .post(
    "/register",
    zValidator("json", registerSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { name, email: rawEmail, password } = c.req.valid("json");
      const email = rawEmail.trim().toLowerCase();

      // Check if email already taken
      const existing = await db.query.users.findFirst({
        where: (t, q) => eq(t.email, email),
      });
      if (existing) {
        return c.json(
          { error: { code: "CONFLICT", message: "Email already registered", status: 409 } },
          409
        );
      }

      const pwHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({ name, email, passwordHash: pwHash })
        .returning();

      const { plaintextKey, keyHash } = await generateApiKey();

      await db.insert(apiKeys).values({
        userId: user!.id,
        name: "default",
        keyHash,
      });

      return c.json({ user: { id: user!.id, name: user!.name, email: user!.email }, apiKey: plaintextKey }, 201);
    }
  )
  .post(
    "/login",
    zValidator("json", loginSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { email, password } = c.req.valid("json");

      const normalizedEmail = email.trim().toLowerCase();
      const user = await db.query.users.findFirst({
        where: (t, q) => eq(t.email, normalizedEmail),
      });

      // Return the same error for all auth failures to prevent account enumeration
      const invalidCredentials = () =>
        c.json(
          { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password", status: 401 } },
          401 as const,
        );

      if (!user) return invalidCredentials();
      if (!user.passwordHash) return invalidCredentials();

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return invalidCredentials();

      // Generate a fresh API key for the user
      const { plaintextKey, keyHash } = await generateApiKey();

      await db.insert(apiKeys).values({
        userId: user.id,
        name: "login",
        keyHash,
      });

      return c.json({ user: { id: user.id, name: user.name, email: user.email }, apiKey: plaintextKey });
    }
  )
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

      const { plaintextKey, keyHash } = await generateApiKey();

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
