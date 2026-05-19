import { test, expect } from "@playwright/test";

test.describe("Pages editor foundation (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pages");
  });

  test("shows editor, copilot, comments, and markdown controls in the real app", async ({ page }) => {
    const manager = page.getByTestId("pages-manager");
    await expect(manager).toBeVisible({ timeout: 15_000 });

    // Create a page to ensure the editor is rendered if no pages exist
    const newPageButton = page.getByRole("button", { name: /New Page/i });
    await expect(newPageButton).toBeVisible();
    await newPageButton.click();

    // Wait for the editor kernel to appear
    const kernel = page.getByTestId("page-editor-kernel");
    await expect(kernel).toBeVisible({ timeout: 15_000 });

    // Sidebar elements
    await expect(page.getByRole("heading", { name: /Page Agent Copilot/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Import Markdown/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Comments/i })).toBeVisible();

    await expect(page.getByRole("button", { name: /Export Markdown/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add comment/i }).first()).toBeVisible();
  });
});
