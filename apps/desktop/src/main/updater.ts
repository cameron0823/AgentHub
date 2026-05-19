import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { configureDesktopLogging } from "./logging";

type UpdateChannel = "stable" | "beta" | "nightly";

type ConfigureUpdaterOptions = {
  force?: boolean;
  channel?: UpdateChannel;
};

let configured = false;

function shouldSkipWindowsFirstRun() {
  return process.platform === "win32" && process.argv.some((arg) => arg.includes("--squirrel-firstrun"));
}

function normalizeChannel(channel: UpdateChannel | undefined) {
  if (!channel || channel === "stable") {
    return "latest";
  }
  return channel;
}

export function configureDesktopUpdater(options: ConfigureUpdaterOptions = {}) {
  const logger = configureDesktopLogging();

  if (configured) {
    logger.info("Desktop updater already configured");
    return;
  }

  if (!options.force && !app.isPackaged) {
    logger.info("Desktop updater disabled in development; pass force to override");
    return;
  }

  if (shouldSkipWindowsFirstRun()) {
    logger.info("Desktop updater skipped during Windows Squirrel first run");
    return;
  }

  configured = true;
  autoUpdater.logger = logger;
  autoUpdater.channel = normalizeChannel(options.channel);
  autoUpdater.autoDownload = true;

  autoUpdater.on("checking-for-update", () => {
    logger.info("Desktop updater state: checking");
  });
  autoUpdater.on("update-available", (info) => {
    logger.info("Desktop updater state: available", info.version);
  });
  autoUpdater.on("update-not-available", (info) => {
    logger.info("Desktop updater state: not-available", info.version);
  });
  autoUpdater.on("update-downloaded", (info) => {
    logger.info("Desktop updater state: downloaded", info.version);
  });
  autoUpdater.on("error", (error) => {
    logger.error("Desktop updater state: error", error);
  });

  void autoUpdater.checkForUpdates().catch((error) => {
    logger.error("Desktop updater check failed", error);
  });
}
