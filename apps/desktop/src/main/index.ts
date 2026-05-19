import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createAgentHubWindow } from "./create-window";
import { registerDesktopIpc } from "./ipc";
import { setAllowedWebOrigin } from "./validate-sender";
import { DesktopWebServerManager } from "./services/web-server";
import { configureDesktopLogging } from "./logging";
import { configureDesktopUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let webOrigin = "";
let webServer: DesktopWebServerManager | null = null;
let quitAfterServicesStop = false;
let stoppingServices = false;

function getRepoRoot() {
  return path.resolve(__dirname, "../../../..");
}

async function bootstrap() {
  webServer = new DesktopWebServerManager({ repoRoot: getRepoRoot() });
  const runtime = await webServer.start();
  webOrigin = runtime.origin;
  setAllowedWebOrigin(webOrigin);

  registerDesktopIpc({
    getMainWindow: () => mainWindow,
    getWebOrigin: () => webOrigin,
  });

  mainWindow = await createAgentHubWindow({ webUrl: webOrigin });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configureDesktopLogging();
  void bootstrap();
  configureDesktopUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createAgentHubWindow({ webUrl: webOrigin });
    }
  });
});

app.on("before-quit", (event) => {
  if (quitAfterServicesStop) {
    return;
  }

  event.preventDefault();
  if (stoppingServices) {
    return;
  }

  stoppingServices = true;
  void (async () => {
    await webServer?.stop();
    quitAfterServicesStop = true;
    app.quit();
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
