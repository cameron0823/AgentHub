import { test, expect } from "@playwright/test";

test.describe("Heterogeneous Agent Runtime", () => {
  test("settings warns before native process runtime is enabled", async ({ page }) => {
    await page.goto("/settings");

    const settings = page.getByTestId("heterogeneous-agent-settings");
    await expect(settings).toBeVisible({ timeout: 15_000 });
    await expect(settings.getByRole("heading", { name: "Heterogeneous Agent Runtime" })).toBeVisible();
    await expect(settings.getByText("Disabled until AGENTHUB_HETEROGENEOUS_ENABLED is true.")).toBeVisible();
    await expect(settings.getByText(/Command allowlist/)).toBeVisible();
    await expect(settings.getByRole("button", { name: "Start test run" })).toBeVisible();

    await settings.getByRole("button", { name: "Add profile" }).click();
    await expect(settings.getByText("Command", { exact: true })).toBeVisible();
    await expect(settings.getByText("Args JSON array")).toBeVisible();
    await expect(settings.getByText("Working directory")).toBeVisible();
    await expect(settings.getByRole("button", { name: "Save profile" })).toBeVisible();
  });
});
