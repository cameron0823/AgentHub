import { test, expect, type Page } from "@playwright/test";
import { createE2ESessionWithMessages, uniqueName } from "../../fixtures";

async function openSeededSession(page: Page, title: string) {
  await page.goto("/");
  const sessionRow = page.getByTestId("session-row").filter({ hasText: title });
  await expect(sessionRow).toBeVisible({ timeout: 15_000 });
  await sessionRow.click();
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
    await page
      .getByTestId("branch-mode-controls")
      .getByRole("button", { name: /^Continuation\b/ })
      .click();

    await expect(page.getByTestId("session-list")).toContainText(`${title} (branch)`, { timeout: 15_000 });
  });

  test("continuation branch preserves original context", async ({ page }) => {
    const title = uniqueName("E2E Branch Context");
    const { assistant } = await createE2ESessionWithMessages(title);

    await openSeededSession(page, title);
    const assistantMessage = page.getByTestId("chat-message").filter({ hasText: assistant.content });
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 });
    await assistantMessage.hover();
    await assistantMessage.getByTitle("Branch conversation").click();
    await expect(page.getByTestId("branch-mode-controls")).toContainText("Continuation");
    await page
      .getByTestId("branch-mode-controls")
      .getByRole("button", { name: /^Continuation\b/ })
      .click();

    await expect(page.getByTestId("chat-message").filter({ hasText: `${title} user prompt` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("chat-message").filter({ hasText: `${title} assistant response` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`${title} future message that should not be copied`)).toHaveCount(0);
  });

  test("standalone branch starts from the selected message only", async ({ page }) => {
    const title = uniqueName("E2E Branch Standalone");
    const { assistant } = await createE2ESessionWithMessages(title);

    await openSeededSession(page, title);
    const assistantMessage = page.getByTestId("chat-message").filter({ hasText: assistant.content });
    await expect(assistantMessage).toBeVisible({ timeout: 15_000 });
    await assistantMessage.hover();
    await assistantMessage.getByTitle("Branch conversation").click();
    await expect(page.getByTestId("branch-mode-controls")).toContainText("Standalone");
    await expect(page.getByTestId("branch-mode-controls")).toContainText("Branch from here only");
    await page
      .getByTestId("branch-mode-controls")
      .getByRole("button", { name: /^Standalone\b/ })
      .click();

    await expect(page.getByTestId("session-list")).toContainText(`${title} (standalone branch)`, { timeout: 15_000 });
    await expect(page.getByTestId("chat-message").filter({ hasText: `${title} assistant response` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`${title} user prompt`)).toHaveCount(0);
  });
});
