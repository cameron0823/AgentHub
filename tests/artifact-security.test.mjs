import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("artifact sanitizer strips unsafe HTML before preview", async () => {
  const [serverSanitizer, sharedSanitizer] = await Promise.all([
    readText("apps/web/src/server/security/sanitize.ts"),
    readText("apps/web/src/lib/security/sanitize.ts"),
  ]);

  assert.match(serverSanitizer, /sanitizeArtifactHtml/);
  assert.match(sharedSanitizer, /export function sanitizeArtifactHtml/);
  assert.match(sharedSanitizer, /script|iframe|object|embed|srcdoc/);
  assert.match(sharedSanitizer, /on\[a-z\]\+/i);
  assert.match(sharedSanitizer, /javascript:/);
  assert.match(sharedSanitizer, /data:text\/html/);
});

test("artifact iframe preview is sandboxed before HTML artifacts are enabled", async () => {
  const [sharedSanitizer, output] = await Promise.all([
    readText("apps/web/src/lib/security/sanitize.ts"),
    readText("apps/web/src/components/SandboxOutput.tsx"),
  ]);

  assert.match(sharedSanitizer, /ARTIFACT_IFRAME_SANDBOX/);
  assert.doesNotMatch(sharedSanitizer, /allow-scripts/);
  assert.doesNotMatch(sharedSanitizer, /allow-same-origin/);
  assert.match(output, /sanitizeArtifactHtml/);
  assert.match(output, /srcDoc/);
  assert.match(output, /sandbox=\{ARTIFACT_IFRAME_SANDBOX\}/);
  assert.match(output, /referrerPolicy="no-referrer"/);
});
