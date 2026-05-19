import { test, expect } from "@playwright/test";

test.describe("Agent Builder Assistant", () => {
  test("assistant diff can be reviewed before applying", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New Agent" }).click();

    const assistant = page.getByTestId("agent-builder-assistant");
    await expect(assistant).toBeVisible({ timeout: 15_000 });
    await assistant
      .getByPlaceholder(/Build a research agent/i)
      .fill("Build a research agent that checks current sources and cites claims.");
    await assistant.getByRole("button", { name: "Draft" }).click();

    const diff = page.getByTestId("assistant diff");
    await expect(diff).toContainText("Research Assistant", { timeout: 15_000 });
    await expect(diff).toContainText("Name");
    await expect(diff.getByRole("button", { name: "Apply" })).toBeVisible();
    await expect(diff.getByRole("button", { name: "Reject" })).toBeVisible();

    await diff.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator('input[name="name"]')).toHaveValue("Research Assistant");
  });
});
