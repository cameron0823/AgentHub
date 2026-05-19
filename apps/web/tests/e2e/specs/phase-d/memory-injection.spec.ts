import { test, expect } from "@playwright/test";
import { createE2EMemory, uniqueName } from "../../fixtures";

test.describe("Memory Injection", () => {
  test("accepted white-box memory is visible for review", async ({ page }) => {
    const memoryValue = uniqueName("E2E accepted memory value");
    await createE2EMemory(memoryValue, "accepted");

    await page.goto("/");
    await page.getByRole("button", { name: "Memory" }).click();

    await expect(page.getByRole("heading", { name: "Memory", exact: true })).toBeVisible();
    await expect(page.getByText(/loading memories/i)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(memoryValue)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/accepted/i).first()).toBeVisible();
  });

  test("auto-extracted memory appears as proposal", async ({ page }) => {
    const memoryValue = uniqueName("E2E proposed memory value");
    await createE2EMemory(memoryValue, "proposed");

    await page.goto("/");
    await page.getByRole("button", { name: "Memory" }).click();

    await expect(page.getByText(/loading memories/i)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(/proposed memory.*pending review/i)).toBeVisible();
    await expect(page.getByText(memoryValue)).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" }).first()).toBeVisible();
  });
});
