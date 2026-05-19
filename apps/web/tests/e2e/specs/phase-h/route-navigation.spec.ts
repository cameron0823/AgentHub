import { test, expect } from "@playwright/test";

test.describe("Persistent route navigation", () => {
  test("lets users leave Projects and return home", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByTestId("projects-manager")).toBeVisible();
    const nav = page.getByTestId("persistent-route-nav");
    await expect(nav).toBeVisible();
    await expect(page.getByTestId("persistent-home-link")).toBeVisible();

    await page.getByTestId("persistent-home-link").click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("new-chat-button")).toBeVisible();
    await expect(page.getByTestId("persistent-route-nav")).toHaveCount(0);
  });
});
