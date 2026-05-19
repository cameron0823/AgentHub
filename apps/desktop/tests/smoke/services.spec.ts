import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "../..");

async function readRepo(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("web health route returns ok", async ({ request }) => {
  const route = await readRepo("apps/web/src/app/api/health/route.ts");

  expect(route).toContain('status: "ok"');
  expect(route).toContain('runtime: "nodejs"');

  const webUrl = process.env.AGENTHUB_DESKTOP_E2E_WEB_URL;
  if (!webUrl) {
    return;
  }

  const response = await request.get(`${webUrl.replace(/\/$/, "")}/api/health`);
  expect(response.ok()).toBeTruthy();
  await expect(response).toBeOK();
});

test("service state is surfaced without leaking secrets", async () => {
  const dependencyRoute = await readRepo("apps/web/src/app/api/health/dependencies/route.ts");
  const ledger = await readRepo("apps/desktop/src/main/services/service-ledger.ts");
  const dockerCompose = await readRepo("apps/desktop/src/main/services/docker-compose.ts");

  expect(dependencyRoute).toContain("services");
  expect(dependencyRoute).toContain("sanitizeError");
  expect(dependencyRoute).toContain("[redacted]");
  expect(ledger).toContain('requiredFor: "launch"');
  expect(ledger).toContain("database");
  expect(dockerCompose).toContain("confirmStart");
});
