import { app } from "electron";
import log from "electron-log";
import path from "node:path";

let configured = false;

export function configureDesktopLogging() {
  if (configured) {
    return log;
  }

  const fileTransport = log.transports.file as typeof log.transports.file & {
    resolvePathFn?: () => string;
  };
  fileTransport.resolvePathFn = () => path.join(app.getPath("logs"), "agenthub-desktop.log");
  log.transports.console.level = app.isPackaged ? "warn" : "debug";
  log.transports.file.level = "info";

  configured = true;
  return log;
}

export const desktopLog = log;
