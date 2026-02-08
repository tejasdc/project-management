import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, ilike, or } from "drizzle-orm";

import type { AppEnv } from "../types/env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
});

export const userRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const q = c.req.query("q")?.trim();

    const items = await db
      .select()
      .from(users)
      .where(
        q
          ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))
          : undefined
      )
      .orderBy(asc(users.name));

    return c.json({ items });
  })
  .post(
    "/",
    zValidator("json", createUserSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");

      const [user] = await db.insert(users).values(data).returning();
      return c.json({ user }, 201);
    }
  );
