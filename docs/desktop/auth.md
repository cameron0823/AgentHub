# Desktop Auth

AgentHub Desktop uses the same NextAuth implementation as `apps/web`. The desktop shell controls only the local origin and external-navigation behavior.

## Loopback Origin

When the desktop shell starts its own web server, it selects a loopback port and sets:

```text
NEXTAUTH_URL=http://127.0.0.1:<selectedPort>
AGENTHUB_DESKTOP_ORIGIN=http://127.0.0.1:<selectedPort>
```

The loopback callback target is the local AgentHub app origin. Auth redirects must return to that origin, including sign-in and sign-out callbacks.

## Secret Handling

If `NEXTAUTH_SECRET` is already provided, the desktop shell passes it through unchanged. If it is missing, the shell creates an app-owned desktop secret under Electron `userData` and passes that value only to the owned local server process. The renderer never receives this secret.

## Development Mode

Local development can use the existing dev credentials provider. Production desktop builds must not depend on dev credentials unless a separate local-only auth mode is approved.

## OAuth Handoff

The BrowserWindow loads only the local AgentHub origin. External OAuth pages open in the system browser through controlled `shell.openExternal` handling. Unknown protocols and non-local in-window navigation are blocked.

Custom protocol callbacks such as `agenthub://auth/callback` are deferred until loopback callback behavior proves insufficient.
