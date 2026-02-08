import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();

vi.mock("node:fs/promises", () => {
  return {
    default: {
      readFile: vi.fn(async (p: string) => {
        if (!mem.has(p)) throw new Error("ENOENT");
        return mem.get(p)!;
      }),
      writeFile: vi.fn(async (p: string, data: string) => {
        mem.set(p, data);
      }),
      mkdir: vi.fn(async () => {
        // no-op
      }),
    },
  };
});

let readConfig: (opts?: { configPath?: string }) => Promise<any>;
let writeConfig: (cfg: any, opts?: { configPath?: string }) => Promise<void>;

describe("cli config", () => {
  beforeAll(async () => {
    const mod = await import("../src/config");
    readConfig = mod.readConfig as any;
    writeConfig = mod.writeConfig as any;
  });

  beforeEach(() => {
    mem.clear();
  });

  it("writes and reads config", async () => {
    const configPath = "/home/test/.pm/config.json";
    await writeConfig({ apiUrl: "http://localhost:3000", apiKey: "pm_test_123" }, { configPath });

    const cfg = await readConfig({ configPath });
    expect(cfg).toEqual({ apiUrl: "http://localhost:3000", apiKey: "pm_test_123" });
  });

  it("returns null when config is missing", async () => {
    const cfg = await readConfig({ configPath: "/missing/config.json" });
    expect(cfg).toBeNull();
  });

  it("returns null when required fields are missing", async () => {
    const configPath = "/home/test/.pm/config.json";
    mem.set(configPath, JSON.stringify({ apiUrl: "http://localhost:3000" }) + "\n");

    const cfg = await readConfig({ configPath });
    expect(cfg).toBeNull();
  });
});
