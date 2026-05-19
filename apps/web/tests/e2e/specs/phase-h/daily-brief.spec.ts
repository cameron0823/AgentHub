import { test, expect } from "@playwright/test";

test.describe("Daily Brief (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows daily brief panel and manual refresh control in the real app", async ({ page }) => {
    const panel = page.getByTestId("daily-brief-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const title = panel.getByRole("heading", { name: /Daily Brief/i });
    await expect(title).toBeVisible();

    const refreshButton = panel.getByRole("button", { name: /Refresh brief/i });
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toBeEnabled();
  });
});
