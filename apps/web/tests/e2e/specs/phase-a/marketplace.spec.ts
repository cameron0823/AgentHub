import { test, expect, type Page } from "@playwright/test";

async function createAgent(page: Page, agentName: string) {
  await page.getByRole("button", { name: /new agent/i }).click();
  await page.fill("[name='name']", agentName);
  await page.fill("[name='systemPrompt']", "You are an e2e marketplace export fixture.");
  await page.getByRole("button", { name: /save agent/i }).click();
  await expect(page.getByTestId("agent-list")).toContainText(agentName);
}

test.describe("Agent Marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /marketplace/i }).click();
  });

  test("user browses bundled catalog", async ({ page }) => {
    await expect(page.getByTestId("catalog-grid")).toBeVisible();
    await expect(page.getByText("Research Copilot")).toBeVisible();
    await expect(page.getByText("Developer Utility Pack")).toBeVisible();
  });

  test("user installs catalog item", async ({ page }) => {
    await page
      .getByTestId("catalog-grid")
      .locator("> div")
      .filter({ hasText: "Research Copilot" })
      .getByRole("button", { name: /^install$/i })
      .click();

    await expect(page.getByRole("status")).toContainText("Installed 1 agent(s) from Research Copilot.");

    // Agent should appear in sidebar
    await page.goto("/");
    await expect(page.getByTestId("agent-list")).toContainText("Research Analyst");
  });

  test("user exports an agent to manifest", async ({ page }) => {
    const agentName = `E2E Export Agent ${Date.now()}`;
    await page.goto("/");
    await createAgent(page, agentName);
    await page.getByRole("button", { name: /marketplace/i }).click();
    const researchOptionValue = await page
      .getByRole("combobox")
      .locator("option", { hasText: agentName })
      .getAttribute("value");

    expect(researchOptionValue).toBeTruthy();
    await page.getByRole("combobox").selectOption(researchOptionValue!);
    await page.getByRole("button", { name: /generate export json/i }).click();

    await expect(page.getByPlaceholder(/exported manifest json/i)).toContainText(agentName);
  });
});
