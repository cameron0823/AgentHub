import { test, expect } from "@playwright/test";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("In-chat KB file viewer", () => {
  test("source card opens a chunk-aware source viewer", async ({ page }) => {
    const sessionTitle = uniqueName("E2E KB Viewer");
    await createE2ESessionWithAssistantMetadata(
      sessionTitle,
      {
        ragSources: [
          {
            id: "e2e-source-1",
            documentId: "e2e-document-1",
            sourceName: "install.ts",
            sourceType: "code",
            mimeType: "text/x-typescript",
            sourceUrl: "https://example.test/install.ts",
            citation: "install.ts - line 12",
            content: "export function installAgentHub() {}",
            similarity: 0.94,
            metadata: { lineStart: 12 },
          },
        ],
      },
      "Use the install guide [1](#cite-1).",
    );

    await page.goto("/");
    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();

    await expect(page.getByTestId("citation-jump-link")).toBeAttached({ timeout: 15_000 });
    await page.getByText("Sources (1)").click();
    await expect(page.getByTestId("rag-source-open")).toBeVisible();
    await page.getByTestId("rag-source-open").click();
    const viewer = page.getByTestId("kb-file-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer).toHaveAttribute("data-viewer-kind", "code");
    await expect(viewer.getByText("install.ts - line 12")).toBeVisible();
  });
});
