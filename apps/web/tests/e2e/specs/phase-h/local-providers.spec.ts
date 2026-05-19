import { test, expect } from "@playwright/test";

test.describe("Local provider parity", () => {
  test("Provider Settings explains local providers require no credentials", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByText(
        "Local providers (Ollama, vLLM, LM Studio, Piper, faster-whisper, ComfyUI, A1111) do not require credentials.",
      ),
    ).toBeVisible();
  });

  test("Model selector keeps the local Ollama fallback visible offline", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^new chat$/i }).click();

    const selector = page.getByLabel("Model");
    await expect(selector).toBeVisible({ timeout: 15_000 });
    await expect(selector).toContainText(/Ollama/);
    await expect(selector).toContainText(/offline/i);
  });
});
