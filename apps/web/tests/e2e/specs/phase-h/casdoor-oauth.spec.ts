import { test, expect } from "@playwright/test";
import { ensureE2ECasdoorOAuthApp } from "../../fixtures";

const CASDOOR_CLIENT_ID = process.env.AUTH_CASDOOR_ID ?? "agenthub";
const CASDOOR_CLIENT_SECRET = process.env.AUTH_CASDOOR_SECRET ?? "agenthub_secret";
const CASDOOR_PASSWORD = process.env.E2E_CASDOOR_PASSWORD ?? "123";

test.describe("Casdoor OAuth", () => {
  test("signs in through local Casdoor OIDC without using dev credentials", async ({ browser, baseURL }) => {
    test.skip(!baseURL, "Playwright baseURL is required for the local Casdoor OAuth proof.");

    await ensureE2ECasdoorOAuthApp({
      clientId: CASDOOR_CLIENT_ID,
      clientSecret: CASDOOR_CLIENT_SECRET,
      redirectUris: [
        "http://localhost:3000/api/auth/callback/casdoor",
        "http://127.0.0.1:3100/api/auth/callback/casdoor",
        `${baseURL}/api/auth/callback/casdoor`,
      ],
    });

    const context = await browser.newContext({ baseURL, storageState: undefined });
    const page = await context.newPage();
    try {
      const signin = await context.request.get("/api/auth/signin?callbackUrl=/");
      expect(signin.status()).toBe(200);
      const csrfToken = (await signin.text()).match(/name="csrfToken" value="([^"]+)"/)?.[1];
      if (!csrfToken) throw new Error("NextAuth signin page did not include a CSRF token");

      const oauthStart = await context.request.post("/api/auth/signin/casdoor", {
        form: { csrfToken, callbackUrl: "/" },
        maxRedirects: 0,
      });
      expect(oauthStart.status()).toBeGreaterThanOrEqual(300);
      expect(oauthStart.status()).toBeLessThan(400);
      const casdoorLocation = oauthStart.headers().location;
      expect(casdoorLocation).toContain("localhost:8000");

      await page.goto(casdoorLocation);
      await expect(page).toHaveURL(/localhost:8000/);

      await page.locator('input[type="text"], input[name="username"], input#username').first().fill("admin");
      await page.locator('input[type="password"]').first().fill(CASDOOR_PASSWORD);
      await page.getByRole("button", { name: /sign in|login/i }).click();

      await page.waitForURL("/", { timeout: 30_000 });
      await expect(page.getByTestId("new-chat-button")).toBeVisible({ timeout: 15_000 });

      const session = await context.request.get("/api/auth/session");
      expect(session.status()).toBe(200);
      expect(await session.json()).toMatchObject({
        user: {
          email: "admin@example.com",
        },
      });
    } finally {
      await context.close();
    }
  });
});
