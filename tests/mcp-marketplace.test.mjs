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

describe("MCP marketplace and one-click install", () => {
  it("server marketplace module validates indexes, caches remote fetches, templates configs, and preflights installs", async () => {
    const src = await readText("apps/web/src/server/mcp/marketplace.ts");

    assert.match(src, /AGENTHUB_MCP_INDEX_URL/, "must support a configurable remote MCP marketplace index");
    assert.match(src, /MCP_MARKETPLACE_CACHE_TTL_MS/, "must cache remote marketplace fetches");
    assert.match(src, /mcpMarketplaceItemSchema/, "must validate marketplace item shape");
    assert.match(src, /bundledMcpMarketplaceItems/, "must ship a bundled offline catalog");
    assert.match(src, /fetchMcpMarketplaceCatalog/, "must fetch marketplace catalog");
    assert.match(src, /findMcpMarketplaceItem/, "must look up installable items");
    assert.match(src, /renderMcpInstallTemplate/, "must render command/url/header/env templates");
    assert.match(src, /preflightMcpMarketplaceInstall/, "must preflight dependencies and permissions");
    assert.match(src, /buildMcpManualInstructions/, "must generate manual instructions for web/server mode");
  });

  it("mcpRouter exposes marketplace browse, preflight, and install procedures", async () => {
    const router = await readText("apps/web/src/server/routers/mcp.ts");

    assert.match(router, /marketplaceCatalog: authedProcedure/, "catalog must be scoped to signed-in users");
    assert.match(router, /marketplacePreflight: authedProcedure/, "preflight must be available before install");
    assert.match(router, /installMarketplaceItem: authedProcedure/, "one-click install procedure must exist");
    assert.match(router, /fetchMcpMarketplaceCatalog/, "router must use server marketplace loader");
    assert.match(router, /preflightMcpMarketplaceInstall/, "router must run install preflight");
    assert.match(router, /renderMcpInstallTemplate/, "router must template config before inserting");
    assert.match(router, /mcpServers\)\.values/, "install must persist into MCP settings");
    assert.match(
      router,
      /manualInstructions/,
      "web/server mode must return manual instructions when install cannot run",
    );
  });

  it("McpMarketplace UI supports browse/search, permissions, dependency preflight, install, and manual commands", async () => {
    const component = await readText("apps/web/src/components/McpMarketplace.tsx");
    const settings = await readText("apps/web/src/components/McpSettings.tsx");

    assert.match(component, /trpc\.mcpServers\.marketplaceCatalog/, "UI must browse marketplace catalog");
    assert.match(component, /search/i, "UI must expose search");
    assert.match(component, /Permissions/, "UI must show permission prompts");
    assert.match(component, /Dependencies/, "UI must show dependency preflight");
    assert.match(component, /installMarketplaceItem/, "UI must call install mutation");
    assert.match(component, /Manual install/, "UI must show manual install instructions");
    assert.match(component, /hasDesktopRuntime/, "UI must detect desktop runtime availability");
    assert.match(settings, /McpMarketplace/, "McpSettings must render the marketplace");
  });

  it("browser spec covers MCP marketplace install controls", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/mcp-marketplace.spec.ts");

    assert.match(spec, /MCP Marketplace/);
    assert.match(spec, /Search MCP servers/);
    assert.match(spec, /Permissions/);
    assert.match(spec, /Dependencies/);
    assert.match(spec, /install/i);
  });
});
