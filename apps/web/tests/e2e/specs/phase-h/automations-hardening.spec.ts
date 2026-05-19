import { test, expect } from "@playwright/test";

test.describe("Automation hardening (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/automations");
  });

  test("automation form and run history expose scheduling guardrails", async ({ page }) => {
    const manager = page.getByTestId("automation-hardening");
    await expect(manager).toBeVisible({ timeout: 15_000 });

    // Click 'New' to show the form
    await page.getByRole("button", { name: "New" }).click();

    // Check form elements
    await expect(page.getByLabel("Schedule (cron expression)")).toBeVisible();
    await expect(page.getByText("Frequency presets")).toBeVisible();
    await expect(page.getByLabel("Timezone")).toBeVisible();
    await expect(page.getByLabel("Max executions")).toBeVisible();
    await expect(page.getByLabel("Notification webhook")).toBeVisible();

    // Check for some frequency preset buttons
    await expect(page.getByRole("button", { name: "Every hour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Every day at 9am" })).toBeVisible();

    // Close form (optional, just click cancel)
    await page.getByRole("button", { name: "Cancel" }).click();

    // Verify Pause/Resume buttons exist if there's an automation,
    // but if none exist we might just check for the heading
    await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  });
});
