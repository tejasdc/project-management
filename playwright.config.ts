import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.CLARIFY_TEST_URL ?? "http://127.0.0.1:18177", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "chromium-phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } } },
    { name: "webkit-phone", use: { browserName: "webkit", viewport: { width: 390, height: 844 } } },
  ],
});
