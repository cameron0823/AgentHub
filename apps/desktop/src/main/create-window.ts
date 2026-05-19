import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { getWindowState, persistWindowState, readWindowState } from "./window-state";

const fallbackHtml = encodeURIComponent(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AgentHub Desktop</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, sans-serif;
        background: #101114;
        color: #f4f4f5;
      }
      main {
        max-width: 560px;
        padding: 32px;
      }
      code {
        color: #8dd3ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>AgentHub web server is not available</h1>
      <p>Start the web app or set <code>AGENTHUB_WEB_URL</code> before launching the desktop shell.</p>
    </main>
  </body>
</html>
`);

function getPreloadPath() {
  return path.join(__dirname, "../preload/index.js");
}

function isAllowedExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedAppUrl(rawUrl: string, allowedOrigin: string) {
  if (!allowedOrigin) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.origin === allowedOrigin && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

type CreateAgentHubWindowOptions = {
  webUrl?: string;
};

export async function createAgentHubWindow(options: CreateAgentHubWindowOptions = {}) {
  const restoredState = await readWindowState(app.getPath("userData"));
  const window = new BrowserWindow({
    width: restoredState?.width ?? 1280,
    height: restoredState?.height ?? 860,
    x: restoredState?.x,
    y: restoredState?.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  const webUrl = options.webUrl ?? process.env.AGENTHUB_WEB_URL;
  const allowedOrigin = webUrl ? new URL(webUrl).origin : "";

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url, allowedOrigin)) {
      return;
    }

    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  window.once("ready-to-show", () => {
    if (restoredState?.maximized) {
      window.maximize();
    }
    window.show();
  });

  window.on("close", () => {
    void persistWindowState(app.getPath("userData"), window);
  });

  window.on("resize", () => {
    void getWindowState(window);
  });

  if (webUrl) {
    await window.loadURL(webUrl);
  } else {
    await window.loadURL(`data:text/html;charset=utf-8,${fallbackHtml}`);
  }

  return window;
}
