# Desktop Keychain

The keychain capability is disabled by default. Runtime info must report `desktopRuntime.capabilities.keychain === false` until the product has an explicit permission UI and a migration strategy for credentials.

## Storage

The first implementation uses Electron `safeStorage` and an encrypted app-owned file under Electron `userData`. It does not migrate existing database credentials and does not expose an OS keychain dependency to the renderer.

## Key Scope

The desktop process accepts only namespaced keys:

- `agenthub:providerCredential:<providerId>`
- `agenthub:mcpServer:<serverId>`

The renderer cannot enumerate arbitrary secrets. There is no list operation.

## Error Handling

Errors must not include secret values. Returned errors are generic and redacted.
