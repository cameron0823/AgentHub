# Desktop STDIO MCP Policy

STDIO MCP support is disabled by default in AgentHub Desktop. The IPC handlers and process lifecycle helpers are present so the desktop shell can be tested safely, but the runtime capability remains false until the shell, auth, updater, and local-service startup gates stay green.

Enabling STDIO MCP requires explicit user approval for each server. The desktop shell only accepts a command as an absolute path or simple executable name, and arguments remain a structured string array passed directly to `spawn` with `shell: false`.

Every start, stop, and error lifecycle event writes an audit log entry under the desktop log directory. Audit records store process metadata plus command and argument hashes, not raw command strings or secret-bearing environment values.

The web app must treat STDIO MCP as desktop-only. Browser sessions can still configure HTTP MCP servers, but STDIO additions require the desktop runtime.
