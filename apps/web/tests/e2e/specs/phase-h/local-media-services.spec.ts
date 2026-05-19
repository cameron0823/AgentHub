import { test, expect } from "@playwright/test";

test.describe("Local media services", () => {
  test("settings shows local voice, image, and generated-image queue status", async ({ page }) => {
    await page.goto("/settings");

    const settings = page.getByTestId("local-media-settings");
    await expect(settings).toBeVisible({ timeout: 15_000 });
    await expect(settings.getByRole("heading", { name: "Local Media Services" })).toBeVisible();
    await expect(settings.getByText("Piper TTS", { exact: true })).toBeVisible();
    await expect(settings.getByText("http://localhost:10200")).toBeVisible();
    await expect(settings.getByText("faster-whisper STT", { exact: true })).toBeVisible();
    await expect(settings.getByText("http://localhost:10300")).toBeVisible();
    await expect(settings.getByText("ComfyUI", { exact: true })).toBeVisible();
    await expect(settings.getByText("http://localhost:8188")).toBeVisible();
    await expect(settings.getByText("AUTOMATIC1111", { exact: true })).toBeVisible();
    await expect(settings.getByText("http://localhost:7860")).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Generated-image queue" })).toBeVisible();
    await expect(settings.getByText(/active .* waiting .* failed|offline/)).toBeVisible();
    await expect(settings.getByRole("button", { name: "Refresh" })).toBeVisible();
  });
});
