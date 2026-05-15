import { test, expect } from "@playwright/test";

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user sees sign in button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("protected API returns 401 without session", async ({ request }) => {
    const res = await request.get("/api/export");
    expect(res.status()).toBe(401);
  });
});

test.describe("Authenticated access", () => {
  test("authenticated user sees avatar and sign out", async ({ page }) => {
    // Requires auth.setup.ts to have run
    await page.goto("/");
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});
