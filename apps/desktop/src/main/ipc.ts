import { app, BrowserWindow, ipcMain, shell } from "electron";
import { desktopIpcChannels } from "../shared/ipc-channels";
import type { DesktopWindowState } from "../shared/desktop-api";
import { getWindowState, normalizeWindowState, writeWindowState } from "./window-state";
import { validateSender } from "./validate-sender";
import { keychainGet, keychainSet } from "./capabilities/keychain";
import { selectFileSnapshot } from "./capabilities/file-snapshots";
import { listStdioMcpProcesses, startStdioMcpProcess, stopStdioMcpProcess } from "./capabilities/stdio-mcp";
import type { StdioMcpStartInput } from "../shared/desktop-api";

const desktopRuntime = {
  capabilities: {
    keychain: false,
    fileSnapshots: true,
    stdioMcp: false,
    cliRegistry: false,
  },
};

type RegisterDesktopIpcOptions = {
  getMainWindow(): BrowserWindow | null;
  getWebOrigin(): string;
};

function getWindowOrThrow(options: RegisterDesktopIpcOptions) {
  const window = options.getMainWindow();
  if (!window || window.isDestroyed()) {
    throw new Error("AgentHub desktop window is not available");
  }
  return window;
}

function removeExistingHandlers() {
  for (const channel of Object.values(desktopIpcChannels)) {
    ipcMain.removeHandler(channel);
  }
}

function isSafeExternalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function assertKeychainEnabled() {
  if (desktopRuntime.capabilities.keychain === true) {
    return;
  }
  throw new Error("Desktop keychain capability is disabled");
}

function assertFileSnapshotsEnabled() {
  if (desktopRuntime.capabilities.fileSnapshots === true) {
    return;
  }
  throw new Error("Desktop file snapshot capability is disabled");
}

function assertStdioMcpEnabled() {
  if (desktopRuntime.capabilities.stdioMcp === true) {
    return;
  }
  throw new Error("Desktop STDIO MCP capability is disabled");
}

export function registerDesktopIpc(options: RegisterDesktopIpcOptions) {
  removeExistingHandlers();

  ipcMain.handle(desktopIpcChannels.getRuntimeInfo, async (event) => {
    validateSender(event.senderFrame);
    const webOrigin = options.getWebOrigin();
    return {
      isDesktop: true,
      platform: process.platform,
      appVersion: app.getVersion(),
      webOrigin,
      services: {
        web: webOrigin ? "healthy" : "unhealthy",
        database: "unknown",
        redis: "unknown",
        objectStorage: "unknown",
      },
      capabilities: desktopRuntime.capabilities,
    };
  });

  ipcMain.handle(desktopIpcChannels.getWindowState, async (event) => {
    validateSender(event.senderFrame);
    return getWindowState(getWindowOrThrow(options));
  });

  ipcMain.handle(desktopIpcChannels.setWindowState, async (event, state: DesktopWindowState) => {
    validateSender(event.senderFrame);
    const nextState = normalizeWindowState(state);
    const window = getWindowOrThrow(options);

    if (window.isMaximized() && !nextState.maximized) {
      window.unmaximize();
    }

    window.setBounds({
      width: nextState.width,
      height: nextState.height,
      x: nextState.x,
      y: nextState.y,
    });

    if (nextState.maximized) {
      window.maximize();
    }

    await writeWindowState(app.getPath("userData"), nextState);
  });

  ipcMain.handle(desktopIpcChannels.openExternal, async (event, rawUrl: string) => {
    validateSender(event.senderFrame);
    if (!isSafeExternalUrl(rawUrl)) {
      return { ok: false, error: "Only https external links can be opened by AgentHub Desktop" };
    }

    await shell.openExternal(rawUrl);
    return { ok: true };
  });

  ipcMain.handle(desktopIpcChannels.keychainGet, async (event, key: string) => {
    validateSender(event.senderFrame);
    assertKeychainEnabled();
    return keychainGet(app.getPath("userData"), key);
  });

  ipcMain.handle(desktopIpcChannels.keychainSet, async (event, key: string, value: string) => {
    validateSender(event.senderFrame);
    assertKeychainEnabled();
    return keychainSet(app.getPath("userData"), key, value);
  });

  ipcMain.handle(desktopIpcChannels.selectFileSnapshot, async (event) => {
    validateSender(event.senderFrame);
    assertFileSnapshotsEnabled();
    return selectFileSnapshot(getWindowOrThrow(options));
  });

  ipcMain.handle(desktopIpcChannels.stdioMcpStart, async (event, input: StdioMcpStartInput) => {
    validateSender(event.senderFrame);
    assertStdioMcpEnabled();
    return startStdioMcpProcess({
      id: input.id,
      command: input.command,
      args: input.args,
      env: input.env,
      auditLogDir: app.getPath("logs"),
    });
  });

  ipcMain.handle(desktopIpcChannels.stdioMcpStop, async (event, id: string) => {
    validateSender(event.senderFrame);
    assertStdioMcpEnabled();
    return stopStdioMcpProcess(id);
  });

  ipcMain.handle(desktopIpcChannels.stdioMcpList, async (event) => {
    validateSender(event.senderFrame);
    assertStdioMcpEnabled();
    return listStdioMcpProcesses();
  });
}
