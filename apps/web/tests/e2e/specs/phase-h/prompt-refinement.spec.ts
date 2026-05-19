import { test, expect } from "@playwright/test";

test.describe("Inline prompt refinement", () => {
  test("shows pre-send refinement controls", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("new-chat-button").click();

    const composer = page.getByPlaceholder(/Message your local AI/i);
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill("make this more useful");

    await expect(page.getByTestId("prompt-refinement-actions")).toBeVisible();
    await expect(page.getByLabel("Rewrite prompt")).toBeVisible();
    await expect(page.getByLabel("Translate to English")).toBeVisible();
    await expect(page.getByLabel("Shorten prompt")).toBeVisible();
    await expect(page.getByLabel("Expand prompt")).toBeVisible();
    await expect(page.getByLabel("Optimize media prompt")).toBeVisible();

    await page.getByLabel("Rewrite prompt").click();
    await expect(composer).toHaveValue("Make this more useful.");

    await page.getByLabel("Optimize media prompt").click();
    await expect(composer).toHaveValue(/Create a production-ready image prompt/);
    await expect(composer).toHaveValue(/quality details, and negative constraints/);
  });
});
