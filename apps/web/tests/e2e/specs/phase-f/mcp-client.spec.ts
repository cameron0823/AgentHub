import { test, expect } from "@playwright/test";
import { createE2EMcpServer, uniqueName } from "../../fixtures";

test.describe("MCP Client", () => {
  test("user configures an HTTP MCP server in settings", async ({ page }) => {
    const serverName = uniqueName("E2E HTTP MCP");

    await page.goto("/settings");
    await page.getByRole("button", { name: /add server/i }).click();
    await page.getByPlaceholder("My MCP Server").fill(serverName);
    await page.locator("select").filter({ has: page.locator("option", { hasText: "HTTP" }) }).selectOption("http");
    await page.getByPlaceholder("http://localhost:3001").fill("http://localhost:3999");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByText(serverName)).toBeVisible();
    await expect(page.getByText("http", { exact: true })).toBeVisible();
  });

  test("configured stdio MCP server exposes management controls", async ({ page }) => {
    const server = await createE2EMcpServer(uniqueName("E2E Stdio MCP"));

    await page.goto("/settings");

    const serverRow = page.getByTestId("mcp-server-row").filter({ hasText: server.name });
    await expect(serverRow).toBeVisible();
    await expect(serverRow.getByText("stdio", { exact: true })).toBeVisible();
    await expect(serverRow.locator('[title="Test connection"]')).toBeVisible();
    await expect(serverRow.locator('[title="Disable"]')).toBeVisible();
  });
});
