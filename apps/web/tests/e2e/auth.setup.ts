import { test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { assertE2EDatabaseReady, closeE2EDatabase, resetE2EData, signInWithDevCredentials } from "./fixtures";

const authFile = "../../test-results/playwright-auth/user.json";

setup("authenticate with dev credentials", async ({ page }) => {
  await assertE2EDatabaseReady();
  await resetE2EData();

  try {
    await signInWithDevCredentials(page);
    await mkdir(path.dirname(path.resolve(process.cwd(), authFile)), { recursive: true });
    await page.context().storageState({ path: authFile });
  } finally {
    await closeE2EDatabase();
  }
});
