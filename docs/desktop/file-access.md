# Desktop File Access

Desktop file access is read-only and requires explicit user intent.

The only approved first milestone flow is selecting a file through the native dialog and returning a bounded snapshot. There is no arbitrary path read IPC, no write path, and no delete or move operation.

## Snapshot Shape

Every snapshot response includes:

- original path
- basename
- size
- MIME guess
- SHA-256 hash
- content preview for small text files

Binary files and files larger than 5 MB are represented as metadata only.

The original path is returned for immediate user context and must not be persisted unless a later permission flow explicitly asks the user.

## Desktop File Agent

The desktop file agent is the approved chat integration for this milestone. It calls the same native dialog flow, converts the selected file into an immutable `desktop_local` snapshot, inserts a file mention into chat, and sends only basename, MIME, size, SHA-256, binary flag, and bounded preview content to the web runtime.

The web chat must not persist the raw local path from desktop snapshots. The path may be visible only inside the immediate native-result object returned to the renderer.
