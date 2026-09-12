import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/workerd.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: true,
  },
});
