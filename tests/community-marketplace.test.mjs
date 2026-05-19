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

test("community marketplace publish helper supports draft and guarded submit flows", async () => {
  const community = await readText("apps/web/src/server/marketplace/community.ts");

  assert.match(community, /AGENTHUB_AGENT_PUBLISH_URL/);
  assert.match(community, /buildCommunityIndexItem/);
  assert.match(community, /publishCommunityManifest/);
  assert.match(community, /fetchWithOutboundGuard/);
  assert.match(community, /AbortSignal\.timeout\(COMMUNITY_MARKETPLACE_PUBLISH_TIMEOUT_MS\)/);
  assert.match(community, /status: "draft"/);
  assert.match(community, /status: "error"/);
});

test("marketplace router exposes user-scoped community publish", async () => {
  const router = await readText("apps/web/src/server/routers/marketplace.ts");

  assert.match(router, /publishAgent: authedProcedure/);
  assert.match(router, /agentId: z\.string\(\)\.uuid\(\)/);
  assert.match(router, /eq\(agents\.id, input\.agentId\), eq\(agents\.userId, ctx\.user\.id\)/);
  assert.match(router, /createAgentExportManifest\(agent\)/);
  assert.match(router, /publishCommunityManifest\(manifest, input\.submit\)/);
});

test("marketplace UI supports community publish plus remote preview and export", async () => {
  const component = await readText("apps/web/src/components/AgentMarketplace.tsx");

  assert.match(component, /type MarketplaceTab = "local" \| "remote" \| "community"/);
  assert.match(component, /Community Publish/);
  assert.match(component, /data-testid="community-marketplace-publish"/);
  assert.match(component, /trpc\.marketplace\.publishAgent\.useMutation/);
  assert.match(component, /Submit to Community/);
  assert.match(component, /data-testid="remote-agent-preview"/);
  assert.match(component, /handleRemoteExport/);
  assert.match(component, /JSON\.stringify\(previewItem\.manifest, null, 2\)/);
});
