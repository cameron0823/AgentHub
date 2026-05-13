import { test as setup } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate with Casdoor", async ({ page }) => {
  await page.goto("http://localhost:3001");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Casdoor OIDC flow
  await page.waitForURL(/localhost:8000/);
  await page.fill('input[name="applicationUsername"]', "admin");
  await page.fill('input[name="password"]', "admin12345");
  await page.click('button[type="submit"]');

  // Consent screen (first time)
  if (await page.isVisible("text=Authorize")) {
    await page.click("text=Authorize");
  }

  await page.waitForURL("http://localhost:3001/");
  await page.context().storageState({ path: authFile });
});
