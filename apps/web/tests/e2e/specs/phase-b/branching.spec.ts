import { test, expect, type Page } from "@playwright/test";
import { createE2ESessionWithMessages, uniqueName } from "../../fixtures";

async function openSeededSession(page: Page, title: string) {
  await page.goto("/");
  await page.getByTestId("session-list").getByText(title, { exact: true }).click();
}

test.describe("Branching Conversations", () => {
  test("user branches from assistant message", async ({ page }) => {
    const title = uniqueName("E2E Branch");
    const { assistant } = await createE2ESessionWithMessages(title);

    await openSeededSession(page, title);

    const assistantMessage = page.getByTestId("chat-message").filter({ hasText: assistant.content });
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 });
    await assistantMessage.hover();
    await assistantMessage.getByTitle("Branch conversation").click();

    await expect(page.getByTestId("session-list")).toContainText(`${title} (branch)`, { timeout: 15_000 });
  });

  test("branched session preserves original context", async ({ page }) => {
    const title = uniqueName("E2E Branch Context");
    const { assistant } = await createE2ESessionWithMessages(title);

    await openSeededSession(page, title);
    const assistantMessage = page.getByTestId("chat-message").filter({ hasText: assistant.content });
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 });
    await assistantMessage.hover();
    await assistantMessage.getByTitle("Branch conversation").click();

    await expect(page.getByTestId("chat-message").filter({ hasText: `${title} user prompt` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chat-message").filter({ hasText: `${title} assistant response` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`${title} future message that should not be copied`)).toHaveCount(0);
  });
});
