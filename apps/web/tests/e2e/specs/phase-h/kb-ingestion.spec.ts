import { test, expect } from "@playwright/test";

test.describe("RAG ingestion formats (Real App)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kb");
  });

  test("shows supported uploads in the real app", async ({ page }) => {
    page.on("response", async (response) => {
      if (response.url().includes("trpc") && !response.ok()) {
        console.error(
          `TRPC Failure: ${response.url()} -> ${response.status()} ${await response.text().catch(() => "")}`,
        );
      }
    });

    const kbPanel = page.getByTestId("knowledge-base");
    await expect(kbPanel).toBeVisible({ timeout: 15_000 });

    // Create a unique KB to see the upload controls
    const kbName = `E2E KB ${Date.now()}`;
    await page.getByRole("button", { name: /New KB/i }).click();
    await page.getByPlaceholder(/Knowledge base name/i).fill(kbName);
    await page.getByRole("button", { name: /Create/i }).click();

    // Wait for the KB to be created in the list
    const kbItem = page.getByText(kbName).first();
    await expect(kbItem).toBeVisible({ timeout: 15_000 });
    await kbItem.click();

    // Check for supported text
    await expect(page.getByText(/Supported: PDF, DOCX, CSV, XLSX, transcripts, code, and Markdown/i)).toBeVisible({
      timeout: 15_000,
    });

    // Check for upload input (hidden but exists)
    const fileInput = page.locator("input[type=file]");
    await expect(fileInput).toHaveAttribute(
      "accept",
      ".pdf,.docx,.csv,.xlsx,.vtt,.srt,.md,.markdown,.ts,.tsx,.js,.jsx,.py,.json",
    );
  });
});
