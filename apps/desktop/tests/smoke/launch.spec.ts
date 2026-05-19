import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "../..");

async function readDesktop(relativePath: string) {
  return readFile(path.join(desktopRoot, relativePath), "utf8");
}

async function closeElectronApp(app: Awaited<ReturnType<typeof electron.launch>>) {
  const child = app.process();
  let closed = false;
  const closePromise = app
    .close()
    .then(() => {
      closed = true;
    })
    .catch(() => {
      closed = true;
    });

  await Promise.race([closePromise, new Promise((resolve) => setTimeout(resolve, 10_000))]);

  if (!closed && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
}

test("launches desktop shell", async () => {
  const main = await readDesktop("src/main/index.ts");
  const createWindow = await readDesktop("src/main/create-window.ts");

  expect(main).toContain("createAgentHubWindow");
  expect(main).toContain("registerDesktopIpc");
  expect(createWindow).toContain("nodeIntegration: false");
  expect(createWindow).toContain("contextIsolation: true");
  expect(createWindow).toContain("sandbox: true");

  if (process.env.AGENTHUB_DESKTOP_E2E_LAUNCH !== "1") {
    return;
  }

  const app = await electron.launch({
    args: [path.join(desktopRoot, "dist/main/index.js")],
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENTHUB_DESKTOP_PORT: process.env.AGENTHUB_DESKTOP_PORT ?? "32111",
      ...(process.env.AGENTHUB_WEB_URL ? { AGENTHUB_WEB_URL: process.env.AGENTHUB_WEB_URL } : {}),
    },
  });

  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle(/AgentHub/i);
    await expect.poll(() => window.evaluate(() => Boolean(window.agenthubDesktop))).toBe(true);

    const runtime = await window.evaluate(() => window.agenthubDesktop?.getRuntimeInfo());
    expect(runtime).toMatchObject({
      isDesktop: true,
      webOrigin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/),
    });
  } finally {
    await closeElectronApp(app);
  }
});

test("desktop runtime is detected", async () => {
  const preload = await readDesktop("src/preload/index.ts");
  const runtime = await readFile(path.join(repoRoot, "apps/web/src/lib/desktop-runtime.ts"), "utf8");

  expect(preload).toContain('contextBridge.exposeInMainWorld("agenthubDesktop"');
  expect(preload).toContain("getRuntimeInfo");
  expect(runtime).toContain("hasDesktopRuntime");
  expect(runtime).toContain("window.agenthubDesktop");
});

test("closing app leaves no owned child process", async () => {
  const main = await readDesktop("src/main/index.ts");
  const webServer = await readDesktop("src/main/services/web-server.ts");

  expect(main).toContain("before-quit");
  expect(main).toContain("webServer?.stop()");
  expect(webServer).toContain("processToStop.kill()");
  expect(webServer).toContain('processToStop.kill("SIGKILL")');
  expect(webServer).toContain("this.ownedProcess = null");
});
