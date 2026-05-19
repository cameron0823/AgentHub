import { test, expect } from "@playwright/test";

test.describe("Theme and Polish", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "agenthub-theme-settings",
        JSON.stringify({ version: 1, theme: "dark", accentPalette: "blue", layoutMode: "chat" }),
      );
      localStorage.setItem("theme", "dark");
    });
  });

  test("user toggles dark mode", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByTitle(/switch to light mode/i).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByTitle(/switch to dark mode/i)).toBeVisible();
  });

  test("PWA manifest is valid", async ({ page }) => {
    const response = await page.request.get("/manifest.json");
    expect(response.ok()).toBeTruthy();

    const manifest = await response.json();
    expect(manifest.name).toContain("AgentHub");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
      ]),
    );
  });

  test("user persists custom theme settings", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText("Accent palette")).toBeVisible();
    await page.getByTestId("accent-swatch-emerald").click();
    await expect(page.locator("html")).toHaveAttribute("data-agenthub-accent", "emerald");

    await page.getByRole("button", { name: "Document" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-agenthub-layout", "document");

    const settings = await page.evaluate(() => localStorage.getItem("agenthub-theme-settings"));
    expect(settings).toContain('"accentPalette":"emerald"');
    expect(settings).toContain('"layoutMode":"document"');
  });
});
