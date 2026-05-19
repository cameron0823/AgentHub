import { test, expect } from "@playwright/test";

test.describe("Vision fallback", () => {
  test("image attachment shows analysis mode before send", async ({ page }) => {
    await page.route("**/api/upload/presigned", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadUrl: "https://uploads.example.test/image.png",
          s3Url: "https://cdn.example.test/image.png",
          key: "e2e/image.png",
          fileId: "e2e-image-file",
        }),
      });
    });
    await page.route("https://uploads.example.test/image.png", async (route) => {
      await route.fulfill({ status: 200, body: "" });
    });
    await page.route("**/api/upload/complete", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          fileId: "e2e-image-file",
          s3Url: "https://cdn.example.test/image.png",
          key: "e2e/image.png",
          detectedMimeType: "image/png",
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /^new chat$/i }).click();
    await expect(page.getByPlaceholder(/message your local ai/i)).toBeVisible();
    await page.setInputFiles("input[type='file']", {
      name: "screenshot.png",
      mimeType: "image/png",
      buffer: Buffer.from("89504e470d0a1a0a", "hex"),
    });

    const attachmentChip = page.getByTestId("file-mention-chip").filter({ hasText: "screenshot.png" });
    await expect(attachmentChip.getByText("Image analysis")).toBeVisible();
    await expect(attachmentChip.getByText("screenshot.png")).toBeVisible();
  });
});
