import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "output/playwright-report", open: "never" }],
      ]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_URL: baseURL,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://scopedelta:scopedelta_local_only@127.0.0.1:5432/scopedelta_test",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "local-development-secret-change-before-production",
      SMTP_HOST: process.env.SMTP_HOST ?? "127.0.0.1",
      SMTP_PORT: process.env.SMTP_PORT ?? "1025",
      SMTP_SECURE: "false",
      SMTP_FROM: "ScopeDelta <no-reply@scopedelta.local>",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
