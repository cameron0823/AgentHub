import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("OpenAPI plugin loader parses operations into portable AgentHub tool descriptors", async () => {
  const [loader, router] = await Promise.all([
    readText("apps/web/src/server/marketplace/openapi.ts"),
    readText("apps/web/src/server/routers/marketplace.ts"),
  ]);

  assert.match(loader, /agenthub\.openapi-plugin\.v1/);
  assert.match(loader, /openapi: z\.string\(\)\.startsWith\("3\."\)/);
  assert.match(loader, /HTTP_METHODS = \["get", "post", "put", "patch", "delete"\]/);
  assert.match(loader, /safeToolName/);
  assert.match(loader, /operationId/);
  assert.match(loader, /requestBody/);
  assert.match(loader, /fetchWithOutboundGuard/);
  assert.match(loader, /AbortSignal\.timeout\(5000\)/);
  assert.match(router, /validateOpenApiPlugin/);
  assert.match(router, /loadOpenApiPlugin/);
  assert.match(router, /installOpenApiPlugin/);
  assert.match(router, /installOpenApiPluginFromUrl/);
  assert.match(router, /listOpenApiPlugins/);
  assert.match(router, /parseOpenApiPlugin/);
  assert.match(router, /fetchOpenApiPlugin/);
});

test("OpenAPI plugin tools install into governed storage and execute through the runtime loop", async () => {
  const [loader, router, streamRoute, agentBuilder, toolsManager, profiles, skillsRouter] = await Promise.all([
    readText("apps/web/src/server/marketplace/openapi.ts"),
    readText("apps/web/src/server/routers/marketplace.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/components/AgentBuilder.tsx"),
    readText("apps/web/src/components/ToolsManager.tsx"),
    readText("apps/web/src/server/tool-profiles.ts"),
    readText("apps/web/src/server/routers/skills.ts"),
  ]);

  assert.match(loader, /openApiPluginToSkillPackage/, "loader must convert plugins to installable packages");
  assert.match(loader, /createOpenApiRuntimeTools/, "loader must expose runtime tools from installed plugins");
  assert.match(loader, /executeOpenApiPluginTool/, "loader must execute generated OpenAPI tools");
  assert.match(loader, /fetchWithOutboundGuard/, "execution must use outbound request guardrails");
  assert.match(loader, /AbortSignal\.timeout/, "execution must be bounded by an abort signal");
  assert.match(router, /source: "openapi"/, "OpenAPI plugins must be distinguishable in installed storage");
  assert.match(router, /skillResources/, "OpenAPI manifests must be stored as package resources");
  assert.match(streamRoute, /createOpenApiRuntimeTools/, "chat runtime must inject selected OpenAPI tools");
  assert.match(agentBuilder, /listOpenApiPlugins/, "agent builder must list installed OpenAPI tools");
  assert.match(agentBuilder, /OpenAPI tools/, "agent builder must expose OpenAPI tool selection");
  assert.match(toolsManager, /openapi-tools-list/, "tools manager must inventory installed OpenAPI tools");
  assert.match(profiles, /openapi:\*/, "tool profiles must support OpenAPI wildcard denial");
  assert.match(skillsRouter, /ne\(installedSkills\.source, "openapi"\)/, "skills list must not show OpenAPI plugins");
});
