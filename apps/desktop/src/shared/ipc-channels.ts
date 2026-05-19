export const desktopIpcChannels = {
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

export type DesktopIpcChannel = (typeof desktopIpcChannels)[keyof typeof desktopIpcChannels];
