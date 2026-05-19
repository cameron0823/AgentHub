import { test, expect } from "@playwright/test";

test.describe("Skills Marketplace (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    // Skills marketplace is a tab in the main Marketplace view
    await page.goto("/");
    await page
      .getByRole("button")
      .filter({ hasText: /Marketplace/i })
      .click();
    await page.getByRole("button", { name: /Skills/i }).click();
  });

  test("installed skill can be inspected in the real app", async ({ page }) => {
    await expect(page.getByTestId("skills-marketplace")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Skills Marketplace/i })).toBeVisible();

    // Browse skills heading
    await expect(page.getByText(/Browse Skills/i)).toBeVisible();
    await expect(page.getByText("Installed Skills", { exact: true })).toBeVisible();

    // Check for permissions section text
    await expect(page.getByText(/Permissions/i).first()).toBeVisible();
  });
});
