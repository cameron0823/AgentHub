import { test, expect } from "@playwright/test";

test.describe("Review tab (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/review");
  });

  test("review workspace exposes repo registration, filters, file tree, and hunks", async ({ page }) => {
    const tab = page.getByTestId("review-tab");
    await expect(tab).toBeVisible({ timeout: 15_000 });

    await expect(page.getByLabel("Repository path")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register repository" })).toBeVisible();
    await expect(page.getByLabel("Filter files")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "File tree" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hunks" })).toBeVisible();

    // Fill repo path and register to see more elements (optional but good for 'real' test)
    // For now just check visibility of base elements
  });
});
