import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "../../fixtures";

const agentName = `E2E CRUD Agent ${Date.now()}`;
const updatedAgentName = `${agentName} Updated`;

test.describe("Agent CRUD", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await ensureE2EAuthenticated(page);
  });

  test("user creates an agent", async ({ page }) => {
    await page.getByRole("button", { name: /new agent/i }).click();

    await page.fill("[name='name']", agentName);
    await page.fill("[name='systemPrompt']", "You are a helpful test assistant.");
    await page.fill("[name='model']", "ollama:qwen2.5:7b");

    const saveAgent = page.getByRole("button", { name: /save agent/i });
    await expect(saveAgent).toBeEnabled({ timeout: 15_000 });
    await saveAgent.click();

    // Should appear in sidebar
    await expect(page.getByTestId("agent-card").filter({ hasText: agentName })).toBeVisible({ timeout: 15_000 });
  });

  test("user edits an agent", async ({ page }) => {
    const agentCard = page.getByTestId("agent-card").filter({ hasText: agentName });
    await expect(agentCard).toBeVisible({ timeout: 15_000 });
    await agentCard.getByRole("button").first().click();

    await page.fill("[name='name']", updatedAgentName);
    const saveAgent = page.getByRole("button", { name: /save agent/i });
    await expect(saveAgent).toBeEnabled({ timeout: 15_000 });
    await saveAgent.click();

    await expect(page.getByTestId("agent-card").filter({ hasText: updatedAgentName })).toBeVisible({ timeout: 15_000 });
  });

  test("user chats with an agent", async ({ page }) => {
    test.skip(!process.env.E2E_OLLAMA, "Set E2E_OLLAMA=1 to run live local-model chat tests.");

    await page
      .getByTestId("agent-card")
      .filter({ hasText: updatedAgentName })
      .getByRole("button", { name: /start chat/i })
      .click();

    const input = page.getByPlaceholder(/message your local ai/i);
    await input.fill("Hello from test");
    await input.press("Enter");

    const messages = page.locator("[data-testid='chat-message']");
    await expect(messages).toHaveCount(2, { timeout: 30000 });
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible({ timeout: 30000 });
  });

  test("user deletes an agent", async ({ page }) => {
    const agentCard = page.getByTestId("agent-card").filter({ hasText: updatedAgentName });
    await expect(agentCard).toBeVisible({ timeout: 15_000 });
    await agentCard.getByRole("button").first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByTestId("agent-card").filter({ hasText: updatedAgentName })).toHaveCount(0, {
      timeout: 15_000,
    });
  });
});
