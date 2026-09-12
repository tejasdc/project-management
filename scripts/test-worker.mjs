import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
execFileSync("corepack", ["pnpm", "--filter", "@pm/api", "exec", "wrangler", "deploy", "--config", "../../wrangler.jsonc", "--dry-run", "--outdir", resolve("tmp/native-bundle")], { stdio: "inherit" });
execFileSync("corepack", ["pnpm", "--filter", "@pm/api", "exec", "vitest", "run", "--config", "vitest.workerd.config.ts"], { stdio: "inherit" });
