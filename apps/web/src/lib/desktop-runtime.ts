export type DesktopServiceStatus = "starting" | "healthy" | "unhealthy" | "unknown" | "not-configured";

export type BrowserDesktopRuntimeInfo = {
  isDesktop: true;
  platform: string;
  appVersion: string;
  webOrigin: string;
  services: {
    web: "starting" | "healthy" | "unhealthy";
    database: DesktopServiceStatus;
    redis: DesktopServiceStatus;
    objectStorage: DesktopServiceStatus;
  };
  capabilities?: {
    keychain: boolean;
    fileSnapshots: boolean;
    stdioMcp: boolean;
    cliRegistry: boolean;
  };
};

export type BrowserDesktopFileSnapshot = {
  originalPath: string;
  basename: string;
  size: number;
  mime: string;
  hash: string;
  binary: boolean;
  contentPreview: string | null;
};

export type BrowserDesktopApi = {
  getRuntimeInfo(): Promise<BrowserDesktopRuntimeInfo>;
  getWindowState(): Promise<{ width: number; height: number; x?: number; y?: number; maximized: boolean }>;
  setWindowState(state: { width: number; height: number; x?: number; y?: number; maximized: boolean }): Promise<void>;
  openExternal(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
  selectFileSnapshot(): Promise<
    { ok: true; snapshot: BrowserDesktopFileSnapshot | null } | { ok: false; error: string }
  >;
};

declare global {
  interface Window {
    agenthubDesktop?: BrowserDesktopApi;
  }
}

export function hasDesktopRuntime() {
  return typeof window !== "undefined" && Boolean(window.agenthubDesktop);
}

export function getDesktopRuntime() {
  return typeof window !== "undefined" ? window.agenthubDesktop : undefined;
}
