import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("Ollama model management", () => {
  it("streams Ollama pull progress from an authenticated API route", async () => {
    const route = await readText("apps/web/src/app/api/providers/ollama/pull/route.ts");

    assert.match(route, /auth\(req\.headers\)/);
    assert.match(route, /providerCredentials/);
    assert.match(route, /validateProviderBaseUrl/);
    assert.match(route, /\/api\/pull/);
    assert.match(route, /stream: true/);
    assert.match(route, /Content-Type": "text\/event-stream"/);
    assert.match(route, /normalizePullProgress/);
    assert.match(route, /percent/);
  });

  it("adds a pull UI with progress, cancellation, and a hardware advisor", async () => {
    const [component, settings] = await Promise.all([
      readText("apps/web/src/components/OllamaModelPull.tsx"),
      readText("apps/web/src/app/settings/page.tsx"),
    ]);

    assert.match(component, /estimateLocalModelHardware/);
    assert.match(component, /VRAM/);
    assert.match(component, /AbortController/);
    assert.match(component, /\/api\/providers\/ollama\/pull/);
    assert.match(component, /getReader\(\)/);
    assert.match(component, /providers\.catalog\.invalidate/);
    assert.match(component, /providers\.models\.invalidate/);
    assert.match(settings, /OllamaModelPull/);
  });
});
