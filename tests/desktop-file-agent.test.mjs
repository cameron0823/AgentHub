import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

test("desktop file snapshots are enabled through the allowlisted native dialog IPC", async () => {
  const [ipc, channels, capability] = await Promise.all([
    readText("apps/desktop/src/main/ipc.ts"),
    readText("apps/desktop/src/shared/ipc-channels.ts"),
    readText("apps/desktop/src/main/capabilities/file-snapshots.ts"),
  ]);

  assert.match(ipc, /fileSnapshots: true/);
  assert.match(ipc, /assertFileSnapshotsEnabled/);
  assert.match(ipc, /selectFileSnapshot\(getWindowOrThrow\(options\)\)/);
  assert.match(channels, /selectFileSnapshot: "desktop:select-file-snapshot"/);
  assert.match(capability, /dialog\.showOpenDialog/);
  assert.match(capability, /createReadStream/);
  assert.match(capability, /readPreviewBytes/);
  assert.doesNotMatch(capability, /writeFile|deleteFile|moveFile/);
});

test("web desktop runtime and chat input consume desktop local snapshots without upload", async () => {
  const [runtime, snapshots, input] = await Promise.all([
    readText("apps/web/src/lib/desktop-runtime.ts"),
    readText("apps/web/src/lib/file-snapshots.ts"),
    readText("apps/web/src/components/ChatInput.tsx"),
  ]);

  assert.match(runtime, /selectFileSnapshot/);
  assert.match(snapshots, /prepareDesktopFileSnapshot/);
  assert.match(snapshots, /source: "desktop_local"/);
  assert.doesNotMatch(snapshots, /originalPath: snapshot\.originalPath/);
  assert.match(input, /getDesktopRuntime/);
  assert.match(input, /desktopFileAgentAvailable/);
  assert.match(input, /desktop\.selectFileSnapshot\(\)/);
  assert.match(input, /prepareDesktopFileSnapshot\(result\.snapshot\)/);
  assert.match(input, /data-testid="desktop-file-agent-button"/);
  assert.match(input, /a\.snapshot\?\.source === "desktop_local"/);
});

test("desktop file access docs define the file-agent persistence boundary", async () => {
  const docs = await readText("docs/desktop/file-access.md");

  assert.match(docs, /Desktop File Agent/);
  assert.match(docs, /desktop_local/);
  assert.match(docs, /must not persist the raw local path/);
  assert.match(docs, /never accept an arbitrary renderer-provided path|no arbitrary path read/i);
});
