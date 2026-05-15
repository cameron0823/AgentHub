import { test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate with dev credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.fill('input[name="email"]', "admin@localhost");
  await page.fill('input[name="password"]', "admin12345");
  await page.getByRole("button", { name: /dev login/i }).click();

  await page.waitForURL("/");
  await page.context().storageState({ path: authFile });
});
