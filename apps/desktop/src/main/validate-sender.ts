import type { WebFrameMain } from "electron";

let allowedWebOrigin = "";

export function setAllowedWebOrigin(origin: string) {
  allowedWebOrigin = origin;
}

export function getAllowedWebOrigin() {
  return allowedWebOrigin;
}

export function validateSender(frame: WebFrameMain | null | undefined) {
  if (!frame) {
    throw new Error("Desktop IPC sender is missing a frame");
  }

  if (!allowedWebOrigin) {
    throw new Error("Desktop IPC origin has not been configured");
  }

  const url = new URL(frame.url);
  const allowed = new URL(allowedWebOrigin);

  if (url.protocol !== allowed.protocol) {
    throw new Error("Desktop IPC sender protocol is not allowed");
  }

  const hostname = url.hostname;
  const allowedHostnames = new Set([allowed.hostname]);
  if (allowed.hostname === "127.0.0.1") {
    allowedHostnames.add("localhost");
  }

  if (!allowedHostnames.has(hostname)) {
    throw new Error("Desktop IPC sender hostname is not allowed");
  }

  if (url.port !== allowed.port) {
    throw new Error("Desktop IPC sender port is not allowed");
  }
}
