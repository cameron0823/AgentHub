import { test, expect } from "@playwright/test";
import { createE2EPageWithHistory, uniqueName } from "../../fixtures";

test.describe("Page edit history", () => {
  test("compares versions and restores a selected snapshot", async ({ page }) => {
    const historyPage = await createE2EPageWithHistory(uniqueName("E2E Page History"));

    await page.goto("/pages");
    await expect(page.getByTestId("pages-manager")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: new RegExp(historyPage.currentTitle) })).toBeVisible({
      timeout: 15_000,
    });

    const historyPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Edit history" }) });
    await expect(historyPanel).toBeVisible();
    await expect(historyPanel.getByText("Version 3 · agent")).toBeVisible({ timeout: 15_000 });
    await expect(historyPanel.getByText("Version 1 · human")).toBeVisible();

    await historyPanel.locator("select").first().selectOption("1");
    await historyPanel.locator("select").nth(1).selectOption("3");
    const compareVersions = historyPanel.getByRole("button", { name: "Compare versions" });
    await expect(compareVersions).toBeEnabled({ timeout: 15_000 });
    await expect(historyPanel.getByText(/\+\d+ \/ -\d+/)).toBeVisible({ timeout: 15_000 });

    await historyPanel
      .locator("article")
      .filter({ hasText: "Version 1 · human" })
      .getByRole("button", { name: "Restore version" })
      .click();

    await expect(page.locator('input[placeholder="Untitled Page"]')).toHaveValue(historyPage.originalTitle, {
      timeout: 15_000,
    });
  });
});
