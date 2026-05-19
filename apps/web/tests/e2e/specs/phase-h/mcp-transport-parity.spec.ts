import { test, expect } from "@playwright/test";
import { createE2EMcpServer, uniqueName } from "../../fixtures";

test.describe("MCP transport parity", () => {
  test("settings surface exposes all transports, health, schema diff, and config import/export", async ({ page }) => {
    const serverName = uniqueName("E2E MCP Transport");
    await createE2EMcpServer(serverName);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "MCP Servers" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Import config" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export config" })).toBeVisible();

    const row = page.getByTestId("mcp-server-row").filter({ hasText: serverName });
    await expect(row).toBeVisible();
    await expect(row.getByText("stdio")).toBeVisible();
    await expect(row.getByText("enabled")).toBeVisible();
    await expect(row.getByText("unknown")).toBeVisible();
    await expect(row.getByText("0 tools")).toBeVisible();
    await expect(row.getByTitle("Test connection")).toBeVisible();

    await page.getByRole("button", { name: "Add Server" }).click();
    const form = page.locator(".agenthub-glass-panel").filter({ hasText: "New MCP Server" });
    const transport = form.locator("select").first();
    await expect(transport).toBeVisible();
    await expect(transport.locator("option", { hasText: "stdio" })).toHaveText("stdio");
    await expect(transport.locator("option", { hasText: "Streamable HTTP" })).toHaveText("Streamable HTTP");
    await expect(transport.locator("option", { hasText: "SSE" })).toHaveText("SSE");
    await transport.selectOption("streamable-http");
    await expect(form.getByText("URL")).toBeVisible();
    await expect(form.getByText("Headers JSON")).toBeVisible();
  });
});
