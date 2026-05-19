import { expect, test } from "@playwright/test";

test.describe("Mobile UX", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("keeps primary navigation reachable and standalone routes responsive", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("mobile-app-bar")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByTestId("new-chat-button")).toBeVisible();

    const sidebarWidth = await page.getByTestId("new-chat-button").evaluate((button) => {
      const panel = button.closest('[class*="w-[calc(100vw-2rem)]"]');
      return panel?.getBoundingClientRect().width ?? 0;
    });
    expect(sidebarWidth).toBeGreaterThan(260);

    await page.getByRole("button", { name: "Close navigation" }).click();
    await page
      .getByTestId("mobile-bottom-nav")
      .getByRole("link", { name: /projects/i })
      .click();

    await expect(page.getByTestId("persistent-route-nav")).toBeVisible();
    await expect(page.getByTestId("projects-manager")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > window.innerWidth + 1 ||
        document.body.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
