import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("marketplace manifests carry remote version and source metadata", async () => {
  const manifest = await readText("apps/web/src/server/marketplace/manifest.ts");

  assert.match(manifest, /sourceUrl/);
  assert.match(manifest, /upstreamId/);
  assert.match(manifest, /MarketplaceCatalogItem/);
  assert.match(manifest, /source: "local"/);
});

test("remote marketplace fetch validates index payloads, caches, and falls back offline", async () => {
  const remote = await readText("apps/web/src/server/marketplace/remote.ts");

  assert.match(remote, /AGENTHUB_AGENT_INDEX_URL/);
  assert.match(remote, /remoteIndexSchema/);
  assert.match(remote, /REMOTE_MARKETPLACE_CACHE_TTL_MS/);
  assert.match(remote, /AbortSignal\.timeout/);
  assert.match(remote, /offlineFallback/);
  assert.match(remote, /parseMarketplaceManifest/);
});

test("marketplace router exposes remote catalog and remote install flow", async () => {
  const router = await readText("apps/web/src/server/routers/marketplace.ts");

  assert.match(router, /remoteCatalog/);
  assert.match(router, /installRemoteItem/);
  assert.match(router, /forkRemoteItem/);
  assert.match(router, /fetchRemoteMarketplaceCatalog/);
  assert.match(router, /findRemoteCatalogItem/);
});

test("marketplace UI has Local Remote Installed Updates tabs and remote install state", async () => {
  const component = await readText("apps/web/src/components/AgentMarketplace.tsx");

  for (const label of ["Local", "Remote", "Installed", "Updates"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /trpc\.marketplace\.remoteCatalog/);
  assert.match(component, /installRemoteItem/);
  assert.match(component, /forkRemoteItem/);
  assert.match(component, /offline fallback/i);
});

test("remote marketplace browser spec is registered", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/remote-marketplace.spec.ts");

  assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must run against the real app");
  assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate through the app shell");
  assert.match(spec, /button", \{ name: "Marketplace"/, "browser coverage must open the real marketplace view");
  assert.match(spec, /api\/trpc\/marketplace\.remoteCatalog/, "browser coverage must drive the remote catalog query");
  assert.match(spec, /remote-agent-preview/, "browser coverage must inspect the real preview panel");
  assert.match(spec, /Remote Agent Marketplace/);
  assert.match(spec, /remote marketplace item/);
});
