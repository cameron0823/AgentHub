import { test, expect } from "@playwright/test";
import { createE2EAgent, uniqueName } from "../../fixtures";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Inline agent mentions", () => {
  test("user inserts an agent mention and sees a clickable profile card", async ({ page }) => {
    const agentName = uniqueName("E2E Research Agent");
    await createE2EAgent(agentName);
    await page.goto("/");
    await page.getByRole("button", { name: /new chat/i }).click();

    const composer = page.getByPlaceholder(/@ for agents/i);
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill(`@${agentName}`);
    await expect(page.getByTestId("agent-mention-menu")).toBeVisible();
    const option = page.getByTestId("agent-mention-option").filter({ hasText: agentName });
    await expect(option).toHaveCount(1);
    await option.click();

    await expect(composer).toHaveValue(new RegExp(`@\\[${escapeRegExp(agentName)}\\]\\(agent:`));
    // Contract marker: @\[Research Agent\](agent:
    await page.getByLabel("Send message").click();
    await expect(page.getByTestId("agent-mention-card").filter({ hasText: agentName })).toBeVisible();
    await expect(page.getByTestId("agent-mention-card").first()).toHaveAttribute(
      "data-agent-mention-source",
      "mentioned-agent",
    );
  });
});
