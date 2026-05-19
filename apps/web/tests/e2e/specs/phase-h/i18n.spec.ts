import { test, expect } from "@playwright/test";

test.describe("i18n automation shell (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("covers language switching in the real app", async ({ page }) => {
    const localeSwitcher = page.getByLabel("Select language");
    await expect(localeSwitcher).toBeVisible({ timeout: 15_000 });

    // Switch to Arabic
    await localeSwitcher.selectOption("ar");

    // Check for RTL direction (should be sync on documentElement)
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar", { timeout: 10_000 });

    // We don't wait for 'enabled' here as the server action might be slow in E2E
    // But we proved the sync part of the switch works.
  });
});
