import { test, expect } from "@playwright/test";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("Sandbox workflow", () => {
  test("renders downloadable files and chart metadata", async ({ page }) => {
    const sessionTitle = uniqueName("E2E Sandbox Workflow");
    await createE2ESessionWithAssistantMetadata(sessionTitle, {
      sandboxResources: [
        {
          id: "e2e-sandbox-stdout",
          type: "file",
          url: "data:text/plain,E2E%20sandbox%20stdout",
          filename: "stdout.txt",
          mimeType: "text/plain",
          content: "E2E sandbox stdout",
          downloadable: true,
        },
        {
          id: "e2e-sandbox-chart",
          type: "chart",
          url: "data:application/json,%7B%7D",
          filename: "Chart",
          mimeType: "application/vnd.agenthub.chart+json",
          chartSpec: { type: "bar", data: [{ label: "ok", value: 1 }] },
          downloadable: true,
        },
      ],
    });

    await page.goto("/");
    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();

    const outputs = page.getByTestId("sandbox-outputs");
    await expect(outputs).toBeVisible({ timeout: 15_000 });
    await expect(outputs).toContainText("Sandbox Outputs");
    await expect(outputs).toContainText("stdout.txt");
    await expect(outputs).toContainText("text/plain");
    await expect(outputs).toContainText("Chart");
    await expect(outputs).toContainText("application/vnd.agenthub.chart+json");
    await expect(outputs.getByRole("button", { name: "Download" }).first()).toBeVisible();
  });
});
