import { test, expect } from "@playwright/test";
import { uniqueName } from "../../fixtures";

test.describe("Tool profiles", () => {
  test("creates and reloads an agent with profile selection and deny-list controls", async ({ page }) => {
    const agentName = uniqueName("E2E Tool Profile Agent");
    await page.goto("/");
    await page.getByRole("button", { name: /new agent/i }).click();

    await page.fill("[name='name']", agentName);
    await page.fill("[name='systemPrompt']", "You are an E2E agent with governed tool access.");
    const profile = page.locator("[name='toolProfile']");
    await expect(profile).toBeVisible();
    await expect(profile.locator("option", { hasText: "Minimal" })).toHaveText("Minimal");
    await expect(profile.locator("option", { hasText: "Full" })).toHaveText("Full");
    await profile.selectOption("full");
    await expect(page.getByText("Every selected tool unless denied.")).toBeVisible();

    await expect(page.getByText("Deny list")).toBeVisible();
    const denyList = page.getByPlaceholder(/execute_code/i);
    await expect(denyList).toBeVisible();
    await denyList.fill("execute_code\nlocal_system");

    const saveAgent = page.getByRole("button", { name: /save agent/i });
    await expect(saveAgent).toBeEnabled({ timeout: 15_000 });
    await saveAgent.click();
    await expect(page.getByTestId("agent-card").filter({ hasText: agentName })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const agentCard = page.getByTestId("agent-card").filter({ hasText: agentName });
    await expect(agentCard).toBeVisible({ timeout: 15_000 });
    await agentCard.getByRole("button").first().click();
    await expect(profile).toHaveValue("full");
    await expect(denyList).toHaveValue(/execute_code[\s\S]*local_system/);
  });
});
