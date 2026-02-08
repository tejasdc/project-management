import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createTestApiKey, createTestUser } from "./factories.js";
import { expectError } from "./helpers.js";

describe("auth middleware", () => {
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

