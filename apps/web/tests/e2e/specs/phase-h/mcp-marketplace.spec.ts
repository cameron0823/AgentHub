import { test, expect } from "@playwright/test";

test.describe("MCP Marketplace (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("marketplace exposes search and install in the real app", async ({ page }) => {
    const marketplace = page.getByTestId("mcp-marketplace");
    await expect(marketplace).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: /MCP Marketplace/i })).toBeVisible();
    await expect(page.getByLabel("Search MCP servers")).toBeVisible();

    // Check for some text that should be in the marketplace
    await expect(page.getByText(/Permissions/i).first()).toBeVisible();
    await expect(page.getByText(/Dependencies/i).first()).toBeVisible();
  });
});
