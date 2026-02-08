import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/pm_dev";

export default defineConfig({
  // Use compiled JS schema so Drizzle Kit can load it without needing TS loaders.
  // Our source uses `.js` specifiers for Node ESM compatibility.
  schema: "./dist/db/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
