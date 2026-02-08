import { rateLimiter, RedisStore } from "hono-rate-limiter";
import type { MiddlewareHandler } from "hono";
import type IORedis from "ioredis";

import { getRedisConnection } from "../jobs/queue.js";
import { logger } from "../lib/logger.js";

function getIp(c: any) {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function toRedisClient(redis: IORedis) {
  return {
    scriptLoad: async (script: string) => {
      const sha = (await (redis as any).script("load", script)) as string;
      return sha;
    },
    evalsha: async <TArgs extends unknown[], TData = unknown>(sha1: string, keys: string[], args: TArgs) => {
      return (await (redis as any).evalsha(sha1, keys.length, ...keys, ...(args as any))) as TData;
    },
    decr: async (key: string) => {
      return (await redis.decr(key)) as number;
    },
    del: async (key: string) => {
      return (await redis.del(key)) as number;
    },
  };
}

function makeRateLimitedResponse(c: any, windowMs: number) {
  const info = c.get("rateLimit" as any) as { resetTime?: Date } | undefined;
  const resetAt = info?.resetTime?.getTime() ?? Date.now() + windowMs;
  const retryAfter = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

  return c.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        status: 429,
        retryAfter,
        requestId: c.get("requestId"),
      },
    },
    429
  );
}

function buildStore(prefix: string) {
  const redis = getRedisConnection();
  if (redis) {
    return new RedisStore({ client: toRedisClient(redis), prefix });
  }
  logger.warn({ prefix }, "Redis unavailable — rate limiting uses in-memory store (not suitable for multi-instance)");
  return undefined; // hono-rate-limiter defaults to in-memory
}

export const tier1IpAuthFailLimiter: MiddlewareHandler = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-6",
  requestPropertyName: "rateLimit",
  store: buildStore("rl:tier1:"),
  keyGenerator: async (c) => `ip:${getIp(c)}`,

  skipSuccessfulRequests: true,
  requestWasSuccessful: async (c) => c.res.status !== 401,

  message: "Too many requests",
  statusCode: 429,
  handler: async (c) => makeRateLimitedResponse(c, 15 * 60 * 1000),
});

export const tier2ApiKeyCaptureLimiter: MiddlewareHandler = rateLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-6",
  requestPropertyName: "rateLimit",
  store: buildStore("rl:tier2:"),
  keyGenerator: async (c: any) => {
    const apiKey = c.get("apiKey") as { id: string } | undefined;
    return apiKey?.id ? `key:${apiKey.id}` : `ip:${getIp(c)}`;
  },
  message: "Too many requests",
  statusCode: 429,
  handler: async (c) => makeRateLimitedResponse(c, 60 * 1000),
});

