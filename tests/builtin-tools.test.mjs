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

describe("Expanded built-in tools", () => {
  it("runtime exposes read-only GitHub, governed web fetch, and desktop-only local system tools", async () => {
    const [index, github, webFetch, localSystem] = await Promise.all([
      readText("packages/agent-runtime/src/index.ts"),
      readText("packages/agent-runtime/src/tools/builtin/github.ts"),
      readText("packages/agent-runtime/src/tools/builtin/web-fetch.ts"),
      readText("packages/agent-runtime/src/tools/builtin/local-system.ts"),
    ]);

    assert.match(index, /githubRepoTool/, "GitHub repo tool must be exported and registered");
    assert.match(index, /webFetchTool/, "web fetch tool must be exported and registered");
    assert.match(index, /localSystemTool/, "local system tool must be exported and registered");
    assert.match(github, /name: "github_repo"/, "GitHub tool id must be stable");
    assert.match(github, /GITHUB_TOKEN|AGENTHUB_GITHUB_TOKEN/, "GitHub tool must require explicit credentials");
    assert.match(github, /method:\s*"GET"/, "GitHub tool must remain read-only");
    assert.doesNotMatch(
      github,
      /method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/,
      "GitHub tool must not expose write verbs",
    );
    assert.match(github, /issues/, "GitHub tool must inspect issues");
    assert.match(github, /pulls/, "GitHub tool must inspect pull requests");
    assert.match(webFetch, /validatePublicHttpUrl/, "web fetch must validate outbound URLs");
    assert.match(webFetch, /isPrivateHostname/, "web fetch must block private network targets");
    assert.match(webFetch, /AGENTHUB_WEB_FETCH_ALLOW_PRIVATE/, "private network override must be explicit");
    assert.match(localSystem, /AGENTHUB_DESKTOP_RUNTIME/, "local system tool must be desktop gated");
    assert.match(localSystem, /capabilities/, "local system surface must be capabilities-only");
    assert.doesNotMatch(localSystem, /spawn\(|exec\(/, "local system surface must not run commands");
  });

  it("tool manager catalog covers built-ins, MCP, skills, and permission metadata", async () => {
    const [component, settings, trust, agentBuilder] = await Promise.all([
      readText("apps/web/src/components/ToolsManager.tsx"),
      readText("apps/web/src/app/settings/page.tsx"),
      readText("apps/web/src/server/routers/trust.ts"),
      readText("apps/web/src/components/AgentBuilder.tsx"),
    ]);

    assert.match(component, /Built-ins/, "ToolsManager must show built-ins");
    assert.match(component, /MCP Servers/, "ToolsManager must show MCP tools");
    assert.match(component, /Skills/, "ToolsManager must show skill tools");
    assert.match(component, /github_repo/, "ToolsManager must include GitHub tool");
    assert.match(component, /web_fetch/, "ToolsManager must include web fetch tool");
    assert.match(component, /local_system/, "ToolsManager must include local system surface");
    assert.match(component, /Permissions/, "ToolsManager must show permissions");
    assert.match(component, /trpc\.mcpServers\.list/, "ToolsManager must list configured MCP servers");
    assert.match(settings, /ToolsManager/, "settings page must render ToolsManager");
    assert.match(trust, /toolCatalog: authedProcedure/, "trust router must expose tool catalog metadata");
    assert.match(trust, /TOOL_PERMISSION_CATALOG/, "trust router must define permission metadata");
    assert.match(agentBuilder, /github_repo/, "Agent builder must allow enabling GitHub tool");
    assert.match(agentBuilder, /web_fetch/, "Agent builder must allow enabling web fetch tool");
    assert.match(agentBuilder, /local_system/, "Agent builder must allow enabling local system tool");
  });

  it("browser spec covers the tools manager surface", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/tools-manager.spec.ts");

    assert.match(spec, /Tools Manager/);
    assert.match(spec, /Built-ins/);
    assert.match(spec, /MCP Servers/);
    assert.match(spec, /Skills/);
    assert.match(spec, /getByTestId\("tools-manager"\)/);
    assert.match(spec, /web_fetch/);
    assert.match(spec, /Permissions/);
  });
});
