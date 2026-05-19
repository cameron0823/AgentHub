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

describe("A2A protocol", () => {
  it("exposes Agent Card discovery and JSON-RPC task methods", async () => {
    const [route, cardRoute] = await Promise.all([
      readText("apps/web/src/app/api/a2a/route.ts"),
      readText("apps/web/src/app/.well-known/agent-card.json/route.ts"),
    ]);

    assert.match(route, /jsonrpc/);
    assert.match(route, /agent\/card/);
    for (const method of ["tasks/get", "tasks/cancel", "tasks/send", "tasks/sendSubscribe"]) {
      assert.match(route, new RegExp(method.replace("/", "\\/")), `route must support ${method}`);
    }
    assert.match(route, /text\/event-stream/);
    assert.match(cardRoute, /buildAgentCard/);
    assert.match(cardRoute, /Cache-Control/);
  });

  it("centralizes A2A task records, capability negotiation, quotas, and user-scoped execution", async () => {
    const helper = await readText("apps/web/src/server/a2a.ts");

    assert.match(helper, /export interface AgentCard/);
    assert.match(helper, /buildAgentCard/);
    assert.match(helper, /negotiateCapabilities/);
    assert.match(
      helper,
      /A2ATaskStatus = "submitted" \| "working" \| "input-required" \| "completed" \| "failed" \| "cancelled"/,
    );
    assert.match(helper, /createTaskRecord/);
    assert.match(helper, /getTaskRecord/);
    assert.match(helper, /updateTaskRecord/);
    assert.match(helper, /executeLocalA2ATask/);
    assert.match(helper, /eq\(agents\.userId, input\.userId\)/);
    assert.match(helper, /checkQuota\(input\.userId, "message"\)/);
    assert.match(helper, /incrementQuota\(input\.userId, \{ messagesSent: 1, tokensUsed, apiCalls: 1 \}\)/);
  });

  it("adds a remote registry client for discovery and heartbeat flows", async () => {
    const registry = await readText("apps/web/src/lib/a2a/registry.ts");

    assert.match(registry, /export class A2ARegistryClient/);
    assert.match(registry, /register\(card: AgentCard\)/);
    assert.match(registry, /heartbeat\(agentId: string\)/);
    assert.match(registry, /search\(query/);
    assert.match(registry, /poll\(query/);
    assert.match(registry, /\/api\/v1\/agents/);
    assert.match(registry, /heartbeat/);
  });

  it("persists A2A communities, peers, and community memberships", async () => {
    const [schema, migration, journal] = await Promise.all([
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0028_a2a_communities_discovery.sql"),
      readText("apps/web/drizzle/meta/_journal.json"),
    ]);

    for (const table of ["a2aCommunities", "a2aPeers", "a2aCommunityMembers"]) {
      assert.match(schema, new RegExp(`export const ${table}`), `schema must export ${table}`);
    }
    for (const table of ["a2a_communities", "a2a_peers", "a2a_community_members"]) {
      assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`), `migration must create ${table}`);
    }
    assert.match(schema, /sharedMemoryKnowledgeBaseId/);
    assert.match(schema, /agentGroupId/);
    assert.match(schema, /uniqueIndex\("a2a_peers_user_endpoint_idx"\)/);
    assert.match(migration, /a2a_community_members_community_peer_idx/);
    assert.match(journal, /0028_a2a_communities_discovery/);
  });

  it("adds mDNS-local discovery and cross-framework adapter contracts", async () => {
    const discovery = await readText("apps/web/src/server/a2a-discovery.ts");

    assert.match(discovery, /A2A_MDNS_SERVICE = "_a2a\._tcp\.local"/);
    assert.match(discovery, /AGENTHUB_MDNS_SERVICE = "_agenthub-a2a\._tcp\.local"/);
    assert.match(discovery, /getA2AMdnsDiscoveryQueries/);
    assert.match(discovery, /discoverLocalA2APeers/);
    assert.match(discovery, /fetchAgentCardFromEndpoint/);
    assert.match(discovery, /A2A_FRAMEWORK_ADAPTERS/);
    for (const framework of ["agenthub", "langgraph", "crewai", "autogen", "openai-assistants"]) {
      assert.match(discovery, new RegExp(framework));
    }
    assert.match(discovery, /buildA2ADelegationPayload/);
    assert.match(discovery, /delegateToA2APeer/);
  });

  it("exposes A2A communities, discovery, and delegation through tRPC and Settings UI", async () => {
    const [router, appRouter, panel, settings, e2e] = await Promise.all([
      readText("apps/web/src/server/routers/a2a.ts"),
      readText("apps/web/src/server/routers/_app.ts"),
      readText("apps/web/src/components/A2ADelegationPanel.tsx"),
      readText("apps/web/src/app/settings/page.tsx"),
      readText("apps/web/tests/e2e/specs/phase-h/a2a-delegation.spec.ts"),
    ]);

    for (const procedure of [
      "adapterContracts",
      "communities",
      "createCommunity",
      "peers",
      "upsertPeer",
      "discoverLocal",
      "delegate",
    ]) {
      assert.match(router, new RegExp(`${procedure}:`), `router must expose ${procedure}`);
    }
    assert.match(appRouter, /a2a: a2aRouter/);
    assert.match(panel, /data-testid="a2a-delegation-panel"/);
    assert.match(panel, /Discover local/);
    assert.match(panel, /Delegate task/);
    assert.match(panel, /mDNS services/);
    assert.match(settings, /A2ADelegationPanel/);
    assert.match(e2e, /a2a-delegation-panel/);
    assert.match(e2e, /Discover local/);
  });
});
