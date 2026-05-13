import { test, expect } from "@playwright/test";

test.describe("Agent Marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001/marketplace");
  });

  test("user browses bundled catalog", async ({ page }) => {
    await expect(page.getByTestId("catalog-grid")).toBeVisible();
    await expect(page.getByText("Research Copilot")).toBeVisible();
    await expect(page.getByText("Developer Utility Pack")).toBeVisible();
  });

  test("user installs catalog item", async ({ page }) => {
    await page.getByText("Research Copilot").click();
    await page.getByRole("button", { name: /install/i }).click();

    // Should show success toast
    await expect(page.getByText(/installed/i)).toBeVisible();

    // Agent should appear in sidebar
    await page.goto("http://localhost:3001");
    await expect(page.getByTestId("agent-list")).toContainText("Research Copilot");
  });

  test("user exports an agent to manifest", async ({ page }) => {
    await page.goto("http://localhost:3001");
    await page.getByText("Research Copilot").click();
    await page.getByRole("button", { name: /export/i }).click();

    // Verify download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download manifest/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});
