import { test, expect, type Page } from "@playwright/test";

async function createAgent(page: Page, agentName: string) {
  await page.getByRole("button", { name: /new agent/i }).click();
  await page.fill("[name='name']", agentName);
  await page.fill("[name='systemPrompt']", "You are an e2e group fixture agent.");
  await page.getByRole("button", { name: /save agent/i }).click();
  await expect(page.getByTestId("agent-list")).toContainText(agentName);
}

async function createGroup(page: Page, groupName: string, agentName: string) {
  await createAgent(page, agentName);
  await page.getByRole("button", { name: /new group/i }).click();

  await page.fill("[name='name']", groupName);
  await page.selectOption("[name='pattern']", "sequential");
  await page
    .locator("label")
    .filter({ hasText: agentName })
    .locator("[data-testid='agent-checkbox']")
    .check();

  await page.getByRole("button", { name: /save group/i }).click();
  await expect(page.getByTestId("group-list")).toContainText(groupName);
}

test.describe("Agent Group Orchestration @ollama", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("user creates a sequential group", async ({ page }) => {
    const suffix = Date.now();
    await createGroup(page, `E2E Sequential Group ${suffix}`, `E2E Group Agent ${suffix}`);
  });

  test("user runs a parallel group task", async ({ page }) => {
    test.skip(!process.env.E2E_OLLAMA, "Set E2E_OLLAMA=1 to run live local-model group orchestration tests.");

    const suffix = Date.now();
    const groupName = `E2E Parallel Group ${suffix}`;
    await createGroup(page, groupName, `E2E Group Runner ${suffix}`);
    await page.getByTestId("group-card").filter({ hasText: groupName }).getByRole("button", { name: /run/i }).click();

    const input = page.getByPlaceholder(/message your local ai/i);
    await input.fill("Generate 3 creative names for a coffee shop");
    await input.press("Enter");

    // Wait for group completion
    await expect(page.getByTestId("group-complete")).toBeVisible({ timeout: 60000 });

    // Should show synthesis
    await expect(page.getByTestId("synthesis-panel")).toContainText(/coffee/i);
  });

  test("user deletes a group", async ({ page }) => {
    const suffix = Date.now();
    const groupName = `E2E Delete Group ${suffix}`;
    await createGroup(page, groupName, `E2E Group Delete Agent ${suffix}`);
    await page.getByTestId("group-card").filter({ hasText: groupName }).getByRole("button", { name: /edit/i }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByTestId("group-list")).not.toContainText(groupName);
  });
});
