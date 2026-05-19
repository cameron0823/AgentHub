import { defineConfig, devices } from "@playwright/test";

if (process.env.FORCE_COLOR && process.env.NO_COLOR) {
  delete process.env.NO_COLOR;
}

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const webServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND ??
  "node scripts/prepare-standalone-assets.mjs && node .next/standalone/apps/web/server.js";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "../../test-results/playwright-web",
  fullyParallel: false,
  workers: process.env.E2E_OLLAMA ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "../../test-results/playwright-auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? baseURL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "agenthub-e2e-nextauth-secret",
      HOSTNAME: "127.0.0.1",
      PORT: "3100",
      OLLAMA_URL: process.env.OLLAMA_URL ?? "http://localhost:11434",
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      AUTH_CASDOOR_ISSUER: process.env.AUTH_CASDOOR_ISSUER ?? "http://localhost:8000",
      SEARXNG_BASE_URL: process.env.SEARXNG_BASE_URL ?? "http://localhost:8080",
      AGENTHUB_ENABLE_DEV_LOGIN: "1",
      AGENTHUB_DISABLE_BACKGROUND_WORKERS: "1",
      AGENTHUB_DISABLE_RATE_LIMIT: "1",
    },
  },
});
