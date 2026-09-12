import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createTestApiKey, createTestUser } from "./factories.js";
import { expectError } from "./helpers.js";


// Keep notification assertions in the native Worker tests.
vi.mock("../src/services/events.js", () => ({
  tryPublishEvent: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(() => {}),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

describe("auth middleware", () => {
  it("allows concurrent valid reads without consuming the failed-auth budget", async () => {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    const responses = await Promise.all(Array.from({ length: 32 }, () => app.request("/api/projects", {
      headers: { authorization: `Bearer ${plaintextKey}` },
    })));
    expect(responses.map(response => response.status)).toEqual(Array(32).fill(200));
  });

  it("blocks after twenty failed authentication attempts", async () => {
    const app = createApp();
    const headers = { "cf-connecting-ip": "192.0.2.7" };
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await app.request("/api/auth/me", { headers })).status).toBe(401);
    }
    const blocked = await app.request("/api/auth/me", { headers });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("rejects requests without Authorization", async () => {
    const app = createApp();
    const res = await app.request("/api/auth/me");
    await expectError(res, { status: 401 });
  });

  it("accepts requests with a valid API key", async () => {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });

    const app = createApp();
    const res = await app.request("/api/auth/me", {
      headers: { authorization: `Bearer ${plaintextKey}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.user?.id).toBe(user.id);
  });
});
