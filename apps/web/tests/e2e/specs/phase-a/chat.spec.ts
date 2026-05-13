import { test, expect } from "@playwright/test";

test.describe("Core Chat @ollama", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3001");
    // Start a new chat if not already in one
    await page.getByRole("button", { name: /new chat/i }).click();
  });

  test("user sends message and receives streaming response", async ({ page }) => {
    const input = page.getByPlaceholder(/type a message/i);
    await input.fill("What is 2+2?");
    await input.press("Enter");

    // Wait for assistant message to appear
    const messages = page.locator("[data-testid='chat-message']");
    await expect(messages).toHaveCount(2); // user + assistant

    // Verify streaming indicator disappears
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible({ timeout: 30000 });

    // Response should contain "4"
    const lastMessage = messages.last();
    await expect(lastMessage).toContainText("4", { timeout: 30000 });
  });

  test("auto title generation works", async ({ page }) => {
    const input = page.getByPlaceholder(/type a message/i);
    await input.fill("Explain quantum computing in simple terms");
    await input.press("Enter");

    // Wait for response to complete
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible({ timeout: 30000 });

    // Check sidebar for auto-generated title
    const sidebar = page.getByTestId("session-list");
    await expect(sidebar).toContainText(/quantum/i, { timeout: 10000 });
  });

  test("stop generation button works", async ({ page }) => {
    const input = page.getByPlaceholder(/type a message/i);
    await input.fill("Write a 500-word essay about the history of computing");
    await input.press("Enter");

    // Click stop while streaming
    const stopButton = page.getByRole("button", { name: /stop/i });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Should no longer be streaming
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible();
  });
});
