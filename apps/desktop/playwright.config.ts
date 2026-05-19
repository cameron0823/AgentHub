import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  reporter: "list",
  timeout: 60_000,
  use: {
    trace: "on-first-retry",
  },
});
