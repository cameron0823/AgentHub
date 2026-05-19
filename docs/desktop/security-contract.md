# Desktop Security Contract

This contract defines the minimum security posture for the AgentHub Electron shell.

## BrowserWindow Defaults

Every AgentHub desktop window must use these Electron defaults:

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
}
```

The renderer must not receive raw `ipcRenderer`, `fs`, `child_process`, `process`, or shell execution primitives.

## Preload Boundary

The preload script exposes only `window.agenthubDesktop`. Each method maps to an allowlisted IPC channel and returns serializable data. The bridge starts with:

- `getRuntimeInfo`
- `getWindowState`
- `setWindowState`
- `openExternal`

All other native capabilities require their own tests, docs, feature flag, and user-intent flow before they can be exposed.

`selectFileSnapshot` is exposed only for the desktop file agent. It must open a native file picker, return a bounded immutable snapshot, and never accept an arbitrary renderer-provided path.

## IPC Rules

IPC channel names live in one shared allowlist. Main-process handlers must use `ipcMain.handle` and call `validateSender` before reading arguments or returning data.

`validateSender` must validate `event.senderFrame` by parsing the frame URL and matching protocol, hostname, and selected port against the runtime origin. The expected first-party origins are:

- `http://127.0.0.1:<selectedPort>`
- `http://localhost:<selectedPort>` only when the service manager intentionally selected localhost
- `app://agenthub` only if a future custom protocol is added with a matching ADR

Generic channel names for shell execution, filesystem access, or process control are not allowed.

## Navigation And Permissions

`setWindowOpenHandler` is deny-by-default. External `https:` links may open through the system browser only after URL validation and explicit main-process handling.

Electron permission requests are deny-by-default. Features such as camera, microphone, geolocation, notifications, downloads, and file access need separate product approval and source tests.

`webview` is not allowed unless a future ADR approves a concrete use case and containment model.

The web app Content Security Policy must remain enabled. Desktop packaging must not weaken CSP to make Electron integration easier.

## Native Operations

Native operations require user intent, scoped arguments, and audit logs. The desktop process must never kill unrelated port listeners, scan the filesystem broadly, mount CLI tools, or start STDIO MCP processes without a user-visible decision and a capability-specific test suite.

Errors returned to the renderer must avoid secrets, connection strings, token values, and full environment dumps.
