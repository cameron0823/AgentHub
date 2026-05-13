import { test, expect } from "@playwright/test";

test.describe("Agent Group Orchestration @ollama", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001");
  });

  test("user creates a sequential group", async ({ page }) => {
    await page.getByRole("button", { name: /new group/i }).click();

    await page.fill("[name='name']", "Sequential Group");
    await page.selectOption("[name='pattern']", "sequential");

    // Add members (requires at least 2 agents to exist)
    const agentCheckboxes = page.locator("[data-testid='agent-checkbox']");
    await agentCheckboxes.nth(0).check();
    await agentCheckboxes.nth(1).check();

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByTestId("group-list")).toContainText("Sequential Group");
  });

  test("user runs a parallel group task", async ({ page }) => {
    await page.getByText("Sequential Group").click();
    await page.getByRole("button", { name: /run task/i }).click();

    const input = page.getByPlaceholder(/enter task/i);
    await input.fill("Generate 3 creative names for a coffee shop");
    await input.press("Enter");

    // Wait for group completion
    await expect(page.getByTestId("group-complete")).toBeVisible({ timeout: 60000 });

    // Should show synthesis
    await expect(page.getByTestId("synthesis-panel")).toContainText(/coffee/i);
  });

  test("user deletes a group", async ({ page }) => {
    await page.getByText("Sequential Group").click();
    await page.getByRole("button", { name: /delete/i }).click();
    await page.getByRole("button", { name: /confirm/i }).click();

    await expect(page.getByTestId("group-list")).not.toContainText("Sequential Group");
  });
});
