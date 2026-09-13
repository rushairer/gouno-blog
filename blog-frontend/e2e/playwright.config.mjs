import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "support-matrix.pw.mjs",
    "support-interactions.pw.mjs",
    "ai-workspace-matrix.pw.mjs",
    "ai-workspace-interactions.pw.mjs",
  ],
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "../playwright-report", open: "never" }],
  ],
  outputDir: "../test-results/ui-browser-acceptance",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm --prefix .. run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
