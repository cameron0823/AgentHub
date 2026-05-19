import { test, expect } from "@playwright/test";

test.describe("A2A delegation controls", () => {
  test("settings gateway exposes discovery, communities, peers, adapters, and delegation", async ({ page }) => {
    await page.goto("/settings");

    const panel = page.getByTestId("a2a-delegation-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("heading", { name: "A2A Delegation" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Discover local" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Add peer" })).toBeVisible();
    await expect(panel.getByText("Community", { exact: true })).toBeVisible();
    await expect(panel.locator("option", { hasText: "Default A2A Community" })).toHaveText("Default A2A Community");
    await expect(panel.getByRole("button", { name: "Create community" })).toBeVisible();

    await panel.getByRole("button", { name: "Add peer" }).click();
    await expect(panel.getByPlaceholder("Peer name")).toBeVisible();
    await expect(panel.getByPlaceholder("http://localhost:3100/api/a2a")).toBeVisible();
    await expect(panel.getByLabel("A2A framework")).toBeVisible();
    await expect(panel.locator("option", { hasText: "langgraph" })).toHaveText("langgraph");
    await expect(panel.locator("option", { hasText: "crewai" })).toHaveText("crewai");

    await expect(panel.getByRole("heading", { name: "Delegate task" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Delegate task" })).toBeVisible();
    await expect(panel.getByText("_agenthub-a2a._tcp.local")).toBeVisible();
    await expect(panel.getByText("_a2a._tcp.local")).toBeVisible();
    await expect(panel.getByText(/Adapter contracts:.*agenthub.*langgraph.*crewai/)).toBeVisible();
  });
});
