import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // All test files share a single Postgres testcontainer, so running files
    // in parallel causes beforeEach truncations to collide with other files'
    // in-flight tests.  Run files sequentially to avoid FK/truncation races.
    fileParallelism: false,
    coverage: {
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
