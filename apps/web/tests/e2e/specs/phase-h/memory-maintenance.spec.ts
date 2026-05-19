import { test, expect } from "@playwright/test";
import { createE2EAgent, createE2EMemory, uniqueName } from "../../fixtures";

test.describe("Memory maintenance", () => {
  test("reviews scoped memories and applies a maintenance suggestion", async ({ page }) => {
    const agent = await createE2EAgent(uniqueName("E2E Memory Agent"));
    const sharedMemory = await createE2EMemory(uniqueName("E2E Shared Memory"), "accepted", {
      category: "preferences",
      key: uniqueName("e2e-memory shared"),
    });
    const agentMemory = await createE2EMemory(uniqueName("E2E Agent Memory"), "accepted", {
      agentId: agent.id,
      category: "preferences",
      key: uniqueName("e2e-memory agent"),
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Memory" }).click();

    const maintenancePanel = page.getByTestId("memory-maintenance-panel");
    await expect(maintenancePanel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Shared memories" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agent-specific memories" })).toBeVisible();
    await expect(page.getByText(sharedMemory.value)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(agentMemory.value)).toBeVisible();

    await page.getByRole("button", { name: "Shared memories" }).click();
    await expect(page.getByText(sharedMemory.value)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(agentMemory.value)).toBeHidden({ timeout: 15_000 });

    await maintenancePanel.getByRole("button", { name: "Review memories" }).click();
    await expect(maintenancePanel.getByText('Normalize category from "preferences" to "preference".')).toBeVisible({
      timeout: 15_000,
    });
    await expect(maintenancePanel.getByText("edit · low risk")).toBeVisible();
    await maintenancePanel.getByRole("button", { name: "Apply suggestion" }).first().click();

    await expect(page.getByText("preference · accepted")).toBeVisible({ timeout: 15_000 });
    await expect(maintenancePanel.getByText("No maintenance suggestions for the current scope.")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Agent-specific memories" }).click();
    await expect(page.getByText(agentMemory.value)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(sharedMemory.value)).toBeHidden({ timeout: 15_000 });
  });
});
