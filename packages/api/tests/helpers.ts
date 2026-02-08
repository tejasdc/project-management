import type { Hono } from "hono";
import { expect } from "vitest";

export async function authedRequest(
  app: Hono<any>,
  opts: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; apiKey: string; json?: unknown }
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.apiKey}`,
  };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  return app.request(opts.path, { method: opts.method, headers, body });
}

export async function expectError(res: Response, opts: { status: number; code?: string }) {
  expect(res.ok).toBe(false);
  expect(res.status).toBe(opts.status);
  const json = (await res.json()) as any;
  expect(json).toHaveProperty("error");
  if (opts.code) expect(json.error?.code).toBe(opts.code);
  return json;
}

