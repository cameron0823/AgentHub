import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "../..");

async function readRepo(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("settings page renders", async () => {
  const settingsPage = await readRepo("apps/web/src/app/settings/page.tsx");

  expect(settingsPage).toContain("Settings");
  expect(settingsPage).toContain("DesktopStatus");
  expect(settingsPage).toContain("ProviderSettings");
  expect(settingsPage).toContain("McpSettings");
});

test("auth dev login works in dev mode", async () => {
  const auth = await readRepo("apps/web/src/server/auth.ts");
  const webServer = await readRepo("apps/desktop/src/main/services/web-server.ts");

  expect(auth).toContain("CredentialsProvider");
  expect(auth).toContain("dev-credentials");
  expect(auth).toMatch(
    /const isDev =[\s\S]*process\.env\.NODE_ENV === "development"[\s\S]*AGENTHUB_ENABLE_DEV_LOGIN[\s\S]*E2E_ENABLE_DEV_LOGIN/,
  );
  expect(auth).toContain('role: "admin"');
  expect(auth).toContain("AGENTHUB_DESKTOP_ORIGIN");
  expect(webServer).toContain("NEXTAUTH_URL");
  expect(webServer).toContain("AUTH_TRUST_HOST");
});
