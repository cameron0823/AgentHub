import { test, expect } from "@playwright/test";

test.describe("MCP Governance Bridge (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test("renders policy controls and audit dashboard in the real app", async ({ page }) => {
    const bridge = page.getByTestId("mcp-governance-bridge");
    await expect(bridge).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: /MCP Governance Bridge/i })).toBeVisible();
    await expect(page.getByText(/Rate limit/i)).toBeVisible();
    await expect(page.getByText(/Blocked patterns/i)).toBeVisible();
    await expect(bridge.getByText(/Audit Log/i)).toBeVisible();
  });
});
