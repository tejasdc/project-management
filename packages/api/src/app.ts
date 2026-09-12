import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql as dsql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getRuntime } from "./runtime.js";

import type { AppEnv } from "./types/env.js";
import { db } from "./db/index.js";
import { toErrorResponse } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { noteRoutes } from "./routes/notes.js";
import { projectRoutes } from "./routes/projects.js";
import { epicRoutes } from "./routes/epics.js";
import { entityRoutes } from "./routes/entities.js";
import { reviewQueueRoutes } from "./routes/review-queue.js";
import { tagRoutes } from "./routes/tags.js";

import { tier1IpAuthFailLimiter } from "./middleware/rate-limit.js";

export function createApp() {
  const base = new Hono<AppEnv>();

  base.onError((err, c) => toErrorResponse(c, err));

  // Pre-auth middleware (rate limiter).
  base.use("/api/*", tier1IpAuthFailLimiter);

  base.use(
    "/api/*",
    cors({
      origin: (origin) => getRuntime().env.CORS_ORIGINS.split(",").includes(origin) ? origin : undefined,
      credentials: false,
      maxAge: 60 * 60 * 24,
    })
  );

  // RequestId + lightweight structured logging.
  base.use("/api/*", async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);

    const started = Date.now();
    try {
      await next();
    } finally {
      const userId = (() => {
        try {
          // Route handlers only have user after auth middleware.
          return c.get("user")?.id as string | undefined;
        } catch {
          return undefined;
        }
      })();

      logger.info(
        {
          requestId,
          userId,
          method: c.req.method,
          path: c.req.path,
          statusCode: c.res.status,
          responseTime: Date.now() - started,
        },
        "request"
      );
    }
  });

  // Public routes
  const withHealth = base.get("/api/health", async (c) => {
    db.get(dsql`select 1`);
    return c.json({ status: "ok", timestamp: new Date().toISOString(), checks: { db: { status: "ok" } } });
  });

  // Auth middleware applied to all other API routes.
  withHealth.use("/api/*", authMiddleware);

  // Routes
  const withRoutes = withHealth
    .get("/api/live", c => getRuntime().upgradeWebSocket(c.req.raw, c.get("apiKey").id))
    .route("/api/auth", authRoutes)
    .route("/api/users", userRoutes)
    .route("/api/notes", noteRoutes)
    .route("/api/projects", projectRoutes)
    .route("/api/epics", epicRoutes)
    .route("/api/entities", entityRoutes)
    .route("/api/review-queue", reviewQueueRoutes)
    .route("/api", tagRoutes)
    // Root (optional)
    .get("/", (c) => c.json({ status: "ok" }));

  withRoutes.notFound((c) =>
    c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Not found",
          status: 404,
          requestId: c.get("requestId"),
        },
      },
      404
    )
  );

  return withRoutes;
}

// Public app instance (used by Hono RPC client typing).
export const app = createApp();
export type AppType = typeof app;
