import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "showcase-parity.pw.mjs",
    "privileged-access-parity.pw.mjs",
    "public-showcase-parity.pw.mjs",
    "users-showcase-parity.pw.mjs",
  ],
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "../playwright-report-showcase-parity", open: "never" },
    ],
  ],
  outputDir: "../test-results/showcase-parity",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm --prefix .. run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "npm --prefix ../../upstream-gouno-ui run showcase:dev -- --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
