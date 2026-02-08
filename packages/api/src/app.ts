import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql as dsql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import net from "node:net";

import type { AppEnv } from "./types/env.js";
import { db } from "./db/index.js";
import { toErrorResponse } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS ?? "";
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return [];
  return items;
}

async function withTimeout<T>(p: Promise<T>, ms: number) {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function checkDb() {
  const started = Date.now();
  try {
    await withTimeout(db.execute(dsql`select 1`), 5000);
    return { status: "ok" as const, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: "fail" as const,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRedis() {
  const started = Date.now();
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return {
      status: "fail" as const,
      latencyMs: 0,
      error: "REDIS_URL is not set",
    };
  }

  try {
    const u = new URL(redisUrl);
    const host = u.hostname;
    const port = Number(u.port || "6379");
    const password = u.password || undefined;

    const result = await withTimeout(
      new Promise<"ok">((resolve, reject) => {
        const socket = net.connect({ host, port });
        socket.setNoDelay(true);

        const cleanup = () => {
          socket.removeAllListeners();
          socket.end();
          socket.destroy();
        };

        const fail = (e: unknown) => {
          cleanup();
          reject(e);
        };

        const sendBulk = (parts: string[]) => {
          const chunks: string[] = [`*${parts.length}\r\n`];
          for (const part of parts) {
            chunks.push(`$${Buffer.byteLength(part)}\r\n${part}\r\n`);
          }
          socket.write(chunks.join(""));
        };

        let authed = !password;
        socket.on("connect", () => {
          if (password) sendBulk(["AUTH", password]);
          else sendBulk(["PING"]);
        });

        socket.on("error", fail);
        socket.on("timeout", () => fail(new Error("timeout")));

        socket.on("data", (buf) => {
          const s = buf.toString("utf8");
          if (!authed) {
            if (s.startsWith("+OK")) {
              authed = true;
              sendBulk(["PING"]);
              return;
            }
            if (s.startsWith("-")) return fail(new Error(s.trim()));
            return;
          }
          if (s.includes("PONG")) {
            cleanup();
            resolve("ok");
            return;
          }
          if (s.startsWith("-")) return fail(new Error(s.trim()));
        });
      }),
      5000
    );

    return { status: result, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: "fail" as const,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => toErrorResponse(c, err));

  app.use(
    "/api/*",
    cors({
      origin: parseCorsOrigins(),
      credentials: false,
      maxAge: 60 * 60 * 24,
    })
  );

  // RequestId + lightweight structured logging.
  app.use("/api/*", async (c, next) => {
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
          url: c.req.url,
          statusCode: c.res.status,
          responseTime: Date.now() - started,
        },
        "request"
      );
    }
  });

  // Public routes
  app.get("/api/health", async (c) => {
    const [dbRes, redisRes] = await Promise.all([checkDb(), checkRedis()]);
    const ok = dbRes.status === "ok" && redisRes.status === "ok";

    return c.json(
      {
        status: ok ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        checks: { db: dbRes, redis: redisRes },
      },
      ok ? 200 : 503
    );
  });

  // Auth middleware applied to all other API routes.
  app.use("/api/*", authMiddleware);

  // Routes
  app.route("/api/auth", authRoutes);
  app.route("/api/users", userRoutes);

  // Root (optional)
  app.get("/", (c) => c.json({ status: "ok" }));

  app.notFound((c) =>
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

  return app;
}

