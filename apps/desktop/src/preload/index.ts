import * as electron from "electron";

type DesktopWindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
};

type StdioMcpStartInput = {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type AgentHubDesktopApi = {
  getRuntimeInfo(): Promise<unknown>;
  getWindowState(): Promise<DesktopWindowState>;
  setWindowState(state: DesktopWindowState): Promise<void>;
  openExternal(url: string): Promise<unknown>;
  keychainGet(key: string): Promise<unknown>;
  keychainSet(key: string, value: string): Promise<unknown>;
  selectFileSnapshot(): Promise<unknown>;
  startStdioMcp(input: StdioMcpStartInput): Promise<unknown>;
  stopStdioMcp(id: string): Promise<unknown>;
  listStdioMcp(): Promise<unknown>;
};

const desktopIpcChannels = {
  getRuntimeInfo: "desktop:get-runtime-info",
  getWindowState: "desktop:get-window-state",
  setWindowState: "desktop:set-window-state",
  openExternal: "desktop:open-external",
  keychainGet: "desktop:keychain-get",
  keychainSet: "desktop:keychain-set",
  selectFileSnapshot: "desktop:select-file-snapshot",
  stdioMcpStart: "desktop:stdio-mcp-start",
  stdioMcpStop: "desktop:stdio-mcp-stop",
  stdioMcpList: "desktop:stdio-mcp-list",
} as const;

const agenthubDesktop: AgentHubDesktopApi = {
  getRuntimeInfo: () => electron.ipcRenderer.invoke(desktopIpcChannels.getRuntimeInfo),
  getWindowState: () => electron.ipcRenderer.invoke(desktopIpcChannels.getWindowState),
  setWindowState: (state: DesktopWindowState) => electron.ipcRenderer.invoke(desktopIpcChannels.setWindowState, state),
  openExternal: (url: string) => electron.ipcRenderer.invoke(desktopIpcChannels.openExternal, url),
  keychainGet: (key: string) => electron.ipcRenderer.invoke(desktopIpcChannels.keychainGet, key),
  keychainSet: (key: string, value: string) => electron.ipcRenderer.invoke(desktopIpcChannels.keychainSet, key, value),
  selectFileSnapshot: () => electron.ipcRenderer.invoke(desktopIpcChannels.selectFileSnapshot),
  startStdioMcp: (input: StdioMcpStartInput) => electron.ipcRenderer.invoke(desktopIpcChannels.stdioMcpStart, input),
  stopStdioMcp: (id: string) => electron.ipcRenderer.invoke(desktopIpcChannels.stdioMcpStop, id),
  listStdioMcp: () => electron.ipcRenderer.invoke(desktopIpcChannels.stdioMcpList),
};

electron.contextBridge.exposeInMainWorld("agenthubDesktop", agenthubDesktop);
