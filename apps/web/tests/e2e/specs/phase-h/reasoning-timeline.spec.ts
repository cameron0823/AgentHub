import { test, expect } from "@playwright/test";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("Reasoning timeline", () => {
  test("renders collapsible provider-visible timeline metadata", async ({ page }) => {
    const sessionTitle = uniqueName("E2E Reasoning Timeline");
    await createE2ESessionWithAssistantMetadata(sessionTitle, {
      reasoningTimeline: [
        {
          id: "reasoning-1",
          kind: "provider_reasoning",
          title: "Provider reasoning",
          visibility: "provider-visible",
          durationMs: 23,
          content: "Visible model reasoning",
        },
      ],
    });

    await page.goto("/");
    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();

    const timeline = page.getByTestId("reasoning-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });
    await expect(timeline.locator("summary").getByText("23ms")).toBeVisible();
    await expect(page.getByText("Visible model reasoning")).toBeHidden();

    await timeline.getByText("Reasoning timeline").click();
    await expect(timeline.getByText("Provider-visible")).toBeVisible();
    await expect(timeline.getByText("Visible model reasoning")).toBeVisible();

    await timeline.getByText("Reasoning timeline").click();
    await expect(page.getByText("Visible model reasoning")).toBeHidden();
  });
});
