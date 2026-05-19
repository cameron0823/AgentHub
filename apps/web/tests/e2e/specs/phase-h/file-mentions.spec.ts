import { test, expect } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("File mention snapshots", () => {
  test("renders file mention snapshot chips and cards", async ({ page }) => {
    const sessionTitle = uniqueName("E2E File Mentions");
    const fileId = "11111111-1111-4111-8111-111111111111";
    const fileUrl = "https://uploads.example.test/notes.md";
    await createE2ESessionWithAssistantMetadata(
      sessionTitle,
      {
        fileSnapshots: [
          {
            id: fileId,
            name: "notes.md",
            mimeType: "text/markdown",
            size: 38,
            hash: "e2efilementionshash",
            binary: false,
            contentPreview: "Preview captured for E2E file mention.",
            source: "browser_upload",
            url: fileUrl,
            s3Key: "e2e/notes.md",
          },
        ],
      },
      `Review @[notes.md](file:${fileId}) before answering.`,
    );

    await page.route("**/api/upload/presigned", async (route) => {
      await route.fulfill({
        json: {
          uploadUrl: "https://uploads.example.test/upload/notes.md",
          s3Url: fileUrl,
          key: "e2e/notes.md",
          fileId,
        },
      });
    });
    await page.route("https://uploads.example.test/upload/notes.md", async (route) => {
      await route.fulfill({ status: 200, body: "" });
    });
    await page.route("**/api/upload/complete", async (route) => {
      await route.fulfill({
        json: {
          s3Url: fileUrl,
          key: "e2e/notes.md",
          fileId,
          detectedMimeType: "text/markdown",
        },
      });
    });

    await page.goto("/");
    await page.getByTestId("new-chat-button").click();
    await page.setInputFiles('input[type="file"]', {
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("Preview captured for E2E file mention."),
    });

    const chip = page.getByTestId("file-mention-chip");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip).toContainText("notes.md");
    await expect(chip).toContainText("Snapshot");
    await expect(chip).toContainText("Preview captured");
    await expect(page.getByPlaceholder(/Message your local AI/i)).toHaveValue(new RegExp(`file:${fileId}`));

    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();
    const card = page.getByTestId("file-mention-card");
    await expect(card).toContainText("File snapshot", { timeout: 15_000 });
    await expect(card).toContainText("notes.md");
    await expect(card).toContainText("text/markdown");
  });
});
