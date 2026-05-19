import { test, expect, type Page } from "@playwright/test";
import { ensureE2EAuthenticated } from "../../fixtures";

function waitForTitleGeneration(page: Page) {
  return page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/trpc/sessions.generateTitle") &&
        response.ok(),
      { timeout: 15_000 },
    )
    .catch(() => null);
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByPlaceholder(/message your local ai/i);
  await input.fill(prompt);
  const sendButton = page.getByRole("button", { name: /send message/i });
  await expect(sendButton).toBeEnabled({ timeout: 15_000 });
  await sendButton.click();
}

test.describe("Core Chat @ollama", () => {
  test.skip(!process.env.E2E_OLLAMA, "Set E2E_OLLAMA=1 to run live local-model chat tests.");

  test.beforeEach(async ({ page }) => {
    await ensureE2EAuthenticated(page);
    // Start a new chat if not already in one
    await page.getByRole("button", { name: /^new chat$/i }).click();
  });

  test("user sends message and receives streaming response", async ({ page }) => {
    const titleGeneration = waitForTitleGeneration(page);
    await sendPrompt(page, "Reply with a short greeting that includes the word hello.");

    // Wait for assistant message to appear
    const messages = page.locator("[data-testid='chat-message']");
    await expect(messages).toHaveCount(2, { timeout: 15_000 }); // user + assistant

    // Verify streaming indicator disappears
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible({ timeout: 30000 });

    // Response should contain the requested greeting keyword.
    const lastMessage = messages.last();
    await expect(lastMessage).toContainText(/hello/i, { timeout: 30000 });
    await titleGeneration;
  });

  test("auto title generation works", async ({ page }) => {
    const titleGeneration = waitForTitleGeneration(page);
    await sendPrompt(page, "Explain quantum computing in simple terms");

    // Wait for response to complete
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible({ timeout: 30000 });

    // Check sidebar for auto-generated title
    const sidebar = page.getByTestId("session-list");
    await expect(sidebar).toContainText(/quantum/i, { timeout: 10000 });
    await titleGeneration;
  });

  test("stop generation button works", async ({ page }) => {
    await sendPrompt(page, "Write a 500-word essay about the history of computing");

    // Click stop while streaming
    const stopButton = page.getByRole("button", { name: /stop/i });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Should no longer be streaming
    await expect(page.getByTestId("streaming-indicator")).not.toBeVisible();
  });
});
