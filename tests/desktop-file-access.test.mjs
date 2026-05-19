import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("file snapshots are selected through native dialog only", async () => {
  const fileSnapshots = await readText("apps/desktop/src/main/capabilities/file-snapshots.ts");
  assert.match(fileSnapshots, /dialog\.showOpenDialog/);
  assert.match(fileSnapshots, /maxFileSizeBytes/);
  assert.doesNotMatch(fileSnapshots, /readLocalFile|writeLocalFile|deleteFile|moveFile/);
});

test("file snapshot metadata includes preview, hash, and original path", async () => {
  const fileSnapshots = await readText("apps/desktop/src/main/capabilities/file-snapshots.ts");
  for (const field of ["originalPath", "basename", "size", "mime", "hash", "contentPreview"]) {
    assert.match(fileSnapshots, new RegExp(field));
  }
  assert.match(fileSnapshots, /createHash\("sha256"\)/);
});

test("binary and oversized file handling is explicit", async () => {
  const fileSnapshots = await readText("apps/desktop/src/main/capabilities/file-snapshots.ts");
  assert.match(fileSnapshots, /binary/i);
  assert.match(fileSnapshots, /5 \* 1024 \* 1024/);
});

test("desktop file access docs require explicit user intent", async () => {
  const docs = await readText("docs/desktop/file-access.md");
  assert.match(docs, /explicit user intent/i);
  assert.match(docs, /read-only/i);
  assert.match(docs, /no arbitrary path read/i);
});
