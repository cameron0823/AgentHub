import { test, expect } from "@playwright/test";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("Artifacts panel", () => {
  test("renders preview and code modes", async ({ page }) => {
    const sessionTitle = uniqueName("E2E Artifact Session");
    await createE2ESessionWithAssistantMetadata(sessionTitle, {
      artifacts: [
        {
          id: "e2e-landing-html",
          title: "landing.html",
          kind: "html",
          language: "html",
          content: "<main><h1>AgentHub artifact</h1></main>",
          previewHtml: "<main><h1>AgentHub artifact</h1></main>",
        },
      ],
    });

    await page.goto("/");
    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();

    const messageArtifacts = page.getByTestId("message-artifacts");
    await expect(messageArtifacts).toBeVisible({ timeout: 15_000 });
    await expect(messageArtifacts).toContainText("Artifacts");
    await messageArtifacts.getByRole("button", { name: "landing.html" }).click();

    const panel = page.getByTestId("artifact-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("heading", { name: "landing.html" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Preview" })).toBeVisible();
    await expect(panel.locator("iframe")).toHaveAttribute("referrerpolicy", "no-referrer");

    await panel.getByRole("button", { name: "Code" }).click();
    await expect(panel.getByText("<main><h1>AgentHub artifact</h1></main>")).toBeVisible();
  });
});
