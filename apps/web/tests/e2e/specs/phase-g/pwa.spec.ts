import { expect, test } from "@playwright/test";

test.describe("PWA parity", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ user: null, expires: new Date(Date.now() + 60_000).toISOString() }),
      });
    });
  });

  test("manifest and service worker are install-ready", async ({ page }) => {
    const manifestResponse = await page.request.get("/manifest.json");
    expect(manifestResponse.ok()).toBeTruthy();

    const manifest = await manifestResponse.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", purpose: "any maskable" }),
        expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", purpose: "any maskable" }),
      ]),
    );

    const swResponse = await page.request.get("/sw.js");
    expect(swResponse.ok()).toBeTruthy();
    expect(swResponse.headers()["content-type"]).toContain("javascript");

    await page.goto("/");
    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return "unsupported";
          const registrations = await navigator.serviceWorker.getRegistrations();
          return (
            registrations
              .map(
                (registration) =>
                  registration.active?.scriptURL ||
                  registration.waiting?.scriptURL ||
                  registration.installing?.scriptURL ||
                  "",
              )
              .find((scriptUrl) => scriptUrl.includes("/sw.js")) || ""
          );
        });
      })
      .toContain("/sw.js");
  });

  test("responsive app shell fits mobile and desktop viewports", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator("body")).toBeVisible();

      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.viewportHeight).toBe(viewport.height);
    }
  });
});
