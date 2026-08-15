import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

const port = 3100;
const baseURL = `http://localhost:${port}`;
const testDatabaseUrl = requireEnvironment("TEST_DATABASE_URL");
const testAuthSecret = requireEnvironment("BETTER_AUTH_SECRET");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
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
    command: process.env.CI
      ? `pnpm start --port ${port}`
      : `pnpm dev --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: testAuthSecret,
      SMTP_HOST: process.env.SMTP_HOST ?? "127.0.0.1",
      SMTP_PORT: process.env.SMTP_PORT ?? "1025",
      SMTP_SECURE: "false",
      SMTP_FROM: "ScopeDelta <no-reply@scopedelta.local>",
      NEXT_TELEMETRY_DISABLED: "1",
      AI_ENABLED: "true",
      AI_PROVIDER: "ollama",
      AI_MODEL: "deterministic-e2e-model",
      OLLAMA_BASE_URL: "http://127.0.0.1:3902",
    },
  },
});

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for browser tests.`);
  return value;
}
