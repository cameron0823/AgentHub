import { test, expect } from "@playwright/test";

test.describe("Agent CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001");
  });

  test("user creates an agent", async ({ page }) => {
    await page.getByRole("button", { name: /new agent/i }).click();

    await page.fill("[name='name']", "Test Agent");
    await page.fill("[name='systemPrompt']", "You are a helpful test assistant.");
    await page.selectOption("[name='model']", "ollama:qwen2.5:7b");

    await page.getByRole("button", { name: /save/i }).click();

    // Should appear in sidebar
    await expect(page.getByTestId("agent-list")).toContainText("Test Agent");
  });

  test("user edits an agent", async ({ page }) => {
    await page.getByText("Test Agent").click();
    await page.getByRole("button", { name: /edit/i }).click();

    await page.fill("[name='name']", "Test Agent Updated");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByTestId("agent-list")).toContainText("Test Agent Updated");
  });

  test("user chats with an agent", async ({ page }) => {
    await page.getByText("Test Agent").click();
    await page.getByRole("button", { name: /start chat/i }).click();

    const input = page.getByPlaceholder(/type a message/i);
    await input.fill("Hello from test");
    await input.press("Enter");

    const messages = page.locator("[data-testid='chat-message']");
    await expect(messages).toHaveCount(2, { timeout: 30000 });
  });

  test("user deletes an agent", async ({ page }) => {
    await page.getByText("Test Agent Updated").click();
    await page.getByRole("button", { name: /delete/i }).click();
    await page.getByRole("button", { name: /confirm/i }).click();

    await expect(page.getByTestId("agent-list")).not.toContainText("Test Agent Updated");
  });
});
