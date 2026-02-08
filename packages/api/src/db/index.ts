import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Keep it simple: a single Postgres.js client shared across requests.
// Postgres.js manages pooling internally.
export const sql = postgres(databaseUrl, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  connect_timeout: 5,
});

export const db = drizzle(sql, { schema });
export type Db = typeof db;

