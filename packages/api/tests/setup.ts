import { beforeEach, afterAll, vi } from "vitest";
import { resetDatabase, sqlite } from "./runtime-fixture.js";
vi.mock("../src/runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../src/runtime.js")>("../src/runtime.js");
  const { runtime } = await import("./runtime-fixture.js");
  return { ...actual, getRuntime: () => runtime };
});
beforeEach(resetDatabase);
afterAll(() => sqlite.close());
