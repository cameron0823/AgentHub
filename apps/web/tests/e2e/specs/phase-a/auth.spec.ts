import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("unauthenticated user sees sign in button", async ({ page }) => {
    await page.goto("http://localhost:3001");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("authenticated user sees avatar and sign out", async ({ page }) => {
    // Requires auth.setup.ts to have run
    await page.goto("http://localhost:3001");
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("protected API returns 401 without session", async ({ request }) => {
    const res = await request.post("http://localhost:3001/api/trpc/agents.list", {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });
});
