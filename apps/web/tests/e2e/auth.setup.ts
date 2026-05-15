import { test as setup } from "@playwright/test";
import { resetE2EData } from "./fixtures";

const authFile = "playwright/.auth/user.json";

setup("authenticate with dev credentials", async ({ page }) => {
  await resetE2EData();

  await page.goto("/api/auth/signin?callbackUrl=/");

  await page.fill('input[name="email"]', "admin@localhost");
  await page.fill('input[name="password"]', "admin12345");
  await page.getByRole("button", { name: /sign in with dev login/i }).click();

  await page.waitForURL("/");
  await page.context().storageState({ path: authFile });
});
