import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ambient-browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4318",
    viewport: { width: 1440, height: 1024 },
    screenshot: "only-on-failure",
    video: process.env.LIVE_DEMO === "1" ? "on" : "retain-on-failure",
  },
  webServer:
    process.env.LIVE_DEMO === "1"
      ? undefined
      : {
          command: "pnpm exec tsx scripts/ambient-test-server.ts",
          url: "http://127.0.0.1:4318/health",
          reuseExistingServer: false,
          timeout: 30000,
        },
});
