import { test, expect } from "@playwright/test";

test.describe("Tools Manager (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("manager shows built-ins, MCP servers, skills, and permissions", async ({ page }) => {
    const manager = page.getByTestId("tools-manager");
    await expect(manager).toBeVisible({ timeout: 15_000 });

    // Check tabs
    await expect(page.getByRole("tab", { name: "Built-ins" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "MCP Servers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Skills" })).toBeVisible();

    // By default 'Built-ins' should be active
    // Check for some common built-in tools
    // These might take a moment to load from TRPC
    await expect(page.getByRole("heading", { name: "web_fetch" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Permissions" }).first()).toBeVisible();

    // Switch to MCP Servers
    await page.getByRole("tab", { name: "MCP Servers" }).click();
    await expect(page.getByPlaceholder("Search tools")).toBeVisible();

    // Switch to Skills
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(page.getByPlaceholder("Search tools")).toBeVisible();
  });
});
