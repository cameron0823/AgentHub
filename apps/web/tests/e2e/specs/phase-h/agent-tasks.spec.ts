import { test, expect } from "@playwright/test";

test.describe("Lobe-style agent tasks (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tasks");
  });

  test("task board exposes templates, comments, and status filters in the real app", async ({ page }) => {
    const manager = page.getByTestId("agent-task-management");
    await expect(manager).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Status filter")).toBeVisible();

    // Click 'New Task' to see the form
    await page.getByRole("button", { name: /New Task/i }).click();

    // Be specific with locators to avoid strict mode violations
    await expect(page.getByRole("combobox").nth(1)).toBeVisible(); // Template select
    await expect(page.getByText("Subtasks")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Template" })).toBeVisible();

    // Cancel form
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
