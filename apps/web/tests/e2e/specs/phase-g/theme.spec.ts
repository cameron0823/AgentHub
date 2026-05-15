import { test, expect } from "@playwright/test";

test.describe("Theme and Polish", () => {
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
});
