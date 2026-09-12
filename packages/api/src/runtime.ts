import { AsyncLocalStorage } from "node:async_hooks";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./db/schema/index.js";
export type Database = BaseSQLiteDatabase<"sync", any, typeof schema>;
export type Runtime = {
  db: Database;
  env: { ANTHROPIC_API_KEY: string; REGISTRATION_CODE: string; CORS_ORIGINS: string; AI_MODEL?: string };
  mutateAndWake: <T>(mutation: () => T) => Promise<T>;
  broadcast: (event: { type: string; ts: string; data: unknown }) => void;
  upgradeWebSocket: (request: Request, keyId: string) => Response;
  revokeSockets: (keyId: string) => void;
};
export const runtimeContext = new AsyncLocalStorage<Runtime>();
export function getRuntime(): Runtime {
  const runtime = runtimeContext.getStore();
  if (!runtime) throw new Error("Workspace runtime is unavailable");
  return runtime;
}
