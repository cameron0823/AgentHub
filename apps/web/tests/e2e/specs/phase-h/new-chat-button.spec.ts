import { expect, test } from "@playwright/test";

test.describe("New Chat button", () => {
  test("creates and activates a blank chat session", async ({ page }) => {
    const trpcFailures: Array<{ status: number; url: string; body: string }> = [];

    page.on("response", async (response) => {
      if (!response.url().includes("/api/trpc/sessions.create") || response.ok()) return;
      trpcFailures.push({
        status: response.status(),
        url: response.url(),
        body: await response.text().catch(() => ""),
      });
    });

    await page.goto("/");

    const newChat = page.getByTestId("new-chat-button");
    await expect(newChat).toBeVisible();
    await expect(newChat).toBeEnabled();

    await newChat.click();

    await expect(page.getByPlaceholder(/message your local ai/i)).toBeVisible();
    await expect(page.getByText(/send a message to start chatting/i)).toBeVisible();
    await expect(page.getByTestId("new-chat-error")).toHaveCount(0);
    expect(trpcFailures).toEqual([]);
  });
});
