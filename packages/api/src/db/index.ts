import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
