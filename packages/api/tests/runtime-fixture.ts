import Sqlite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import * as schema from "../src/db/schema/index.js";
import type { Runtime } from "../src/runtime.js";
export const sqlite = new Sqlite(":memory:");
sqlite.pragma("foreign_keys = ON");
for (const file of readdirSync(new URL("../drizzle-sqlite/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(new URL("../drizzle-sqlite/" + file, import.meta.url), "utf8"));
}
export const runtime: Runtime = {
  db: drizzle(sqlite, { schema }) as unknown as Runtime["db"],
  env: { ANTHROPIC_API_KEY: "test-only", REGISTRATION_CODE: "test-invitation", CORS_ORIGINS: "http://localhost" },
  mutateAndWake: async mutation => mutation(),
  broadcast: () => {},
  revokeSockets: () => {},
  upgradeWebSocket: () => new Response(null, { status: 426 }),
};
export function resetDatabase() {
  sqlite.pragma("foreign_keys = OFF");
  for (const { name } of sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {name: string}[]) {
    sqlite.exec('DELETE FROM "' + name + '"');
  }
  sqlite.pragma("foreign_keys = ON");
}
