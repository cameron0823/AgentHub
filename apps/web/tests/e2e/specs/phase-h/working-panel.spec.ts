import { test, expect } from "@playwright/test";

test.describe("Agent Working Panel", () => {
  test("opens beside chat with working tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("new-chat-button").click();
    await page.getByTestId("working-panel-toggle").click();

    const panel = page.getByTestId("agent-working-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("heading", { name: "Agent Working Panel" })).toBeVisible();

    for (const tab of ["Active documents", "Task progress", "Run logs", "Citations", "Document history"]) {
      await panel.getByRole("button", { name: tab }).click();
      await expect(panel.getByText(tab).last()).toBeVisible();
    }
  });
});
