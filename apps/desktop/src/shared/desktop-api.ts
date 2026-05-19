export type DesktopServiceStatus = "starting" | "healthy" | "unhealthy" | "unknown" | "not-configured";

export type DesktopRuntimeInfo = {
  isDesktop: true;
  platform: NodeJS.Platform;
  appVersion: string;
  webOrigin: string;
  services: {
    web: "starting" | "healthy" | "unhealthy";
    database: DesktopServiceStatus;
    redis: DesktopServiceStatus;
    objectStorage: DesktopServiceStatus;
  };
  capabilities: {
    keychain: boolean;
    fileSnapshots: boolean;
    stdioMcp: boolean;
    cliRegistry: boolean;
  };
};

export type DesktopWindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
};

export type DesktopOpenExternalResult = { ok: true } | { ok: false; error: string };

export type StdioMcpStartInput = {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type StdioMcpProcessInfo = {
  id: string;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  startedAt: string;
};

export type AgentHubDesktopApi = {
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  getWindowState(): Promise<DesktopWindowState>;
  setWindowState(state: DesktopWindowState): Promise<void>;
  openExternal(url: string): Promise<DesktopOpenExternalResult>;
  keychainGet(key: string): Promise<{ ok: true; value: string | null } | { ok: false; error: string }>;
  keychainSet(key: string, value: string): Promise<{ ok: true } | { ok: false; error: string }>;
  selectFileSnapshot(): Promise<
    | {
        ok: true;
        snapshot: {
          originalPath: string;
          basename: string;
          size: number;
          mime: string;
          hash: string;
          binary: boolean;
          contentPreview: string | null;
        } | null;
      }
    | { ok: false; error: string }
  >;
  startStdioMcp(input: StdioMcpStartInput): Promise<StdioMcpProcessInfo>;
  stopStdioMcp(id: string): Promise<{ ok: true; stopped: boolean }>;
  listStdioMcp(): Promise<StdioMcpProcessInfo[]>;
};
