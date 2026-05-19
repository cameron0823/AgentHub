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

describe("Tool profiles and deny lists", () => {
  it("defines stable tool profile presets and a compiler", async () => {
    const profiles = await readText("apps/web/src/server/tool-profiles.ts");

    for (const profile of ["minimal", "research", "coding", "messaging", "admin", "full"]) {
      assert.match(profiles, new RegExp(profile), `profile ${profile} must be defined`);
    }
    assert.match(profiles, /TOOL_PROFILES/, "profile catalog must be exported");
    assert.match(profiles, /compileToolProfile/, "profile compiler must be exported");
    assert.match(profiles, /isToolAllowedByProfile/, "runtime extra tool helper must be exported");
    assert.match(profiles, /deniedTools/, "compiler must apply deny lists");
  });

  it("persists per-agent profile selection and deny lists", async () => {
    const schema = await readText("apps/web/src/server/db/schema.ts");
    const migration = await readText("apps/web/drizzle/0016_tool_profiles.sql");
    const router = await readText("apps/web/src/server/routers/agents.ts");

    assert.match(schema, /toolProfile/, "agents schema must store tool profile");
    assert.match(schema, /deniedTools/, "agents schema must store denied tools");
    assert.match(migration, /tool_profile/, "migration must add tool profile column");
    assert.match(migration, /denied_tools/, "migration must add denied tools column");
    assert.match(router, /toolProfileSchema/, "agents router must validate tool profile");
    assert.match(router, /deniedTools: z\.array/, "agents router must validate deny list");
    assert.match(router, /toolProfile: input\.toolProfile/, "create path must persist selected profile");
    assert.match(router, /deniedTools: input\.deniedTools/, "create path must persist deny list");
  });

  it("chat stream compiles profile access and prunes MCP, skill, and built-in tools before model exposure", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

    assert.match(route, /compileToolProfile/, "chat route must compile selected tools through the profile");
    assert.match(route, /runtimeTools/, "chat route must pass pruned built-ins to runtime");
    assert.match(route, /isToolAllowedByProfile/, "chat route must filter extra MCP and skill tools");
    assert.match(
      route,
      /deniedTools: compiledToolAccess\.deniedTools/,
      "runtime must receive deny list for final enforcement",
    );
    assert.match(route, /tools: runtimeTools/, "runtime must receive profile-pruned tools");
  });

  it("AgentRuntime denies blocked tool calls before execution even if a provider asks for them", async () => {
    const runtime = await readText("packages/agent-runtime/src/runtime.ts");
    const types = await readText("packages/agent-runtime/src/types.ts");

    assert.match(types, /deniedTools\?: string\[\]/, "RunOptions must carry denied tool names");
    assert.match(runtime, /deniedTools/, "runtime must read denied tools");
    assert.match(
      runtime,
      /Tool .* blocked by tool profile deny list/,
      "runtime must return an explicit deny-list error",
    );
    assert.match(runtime, /exposedToolNames/, "runtime must verify tool calls are exposed before execution");
    assert.match(runtime, /globalToolRegistry\.list\(\)\.filter/, "runtime must filter model-visible built-in tools");
    assert.match(
      runtime,
      /!deniedToolSet\.has\(t\.name\)/,
      "runtime must remove denied tools from model-visible tools",
    );
  });

  it("Agent Builder and Tools Manager expose profile and deny-list controls", async () => {
    const builder = await readText("apps/web/src/components/AgentBuilder.tsx");
    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    const store = await readText("apps/web/src/stores/chatStore.ts");
    const manager = await readText("apps/web/src/components/ToolsManager.tsx");

    assert.match(store, /ToolProfile/, "chat store must type tool profiles");
    assert.match(store, /deniedTools/, "chat store must carry denied tools");
    assert.match(builder, /Tool profile/, "Agent Builder must expose profile selection");
    assert.match(builder, /Deny list/, "Agent Builder must expose denied tools");
    assert.match(builder, /TOOL_PROFILE_OPTIONS/, "Agent Builder must list profile options");
    assert.match(sidebar, /toolProfile: agent\.toolProfile/, "sidebar hydration must preserve persisted profiles");
    assert.match(
      sidebar,
      /deniedTools: parseStringArray\(agent\.deniedTools\)/,
      "sidebar hydration must preserve deny lists",
    );
    assert.match(manager, /Tool profiles/, "Tools Manager must document profile behavior");
    assert.match(manager, /minimal/, "Tools Manager must surface profile names");
  });

  it("browser spec covers profile controls", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/tool-profiles.spec.ts");

    assert.match(spec, /Tool profile/);
    assert.match(spec, /Deny list/);
    assert.match(spec, /Minimal/);
    assert.match(spec, /Full/);
  });

  it("preserves legacy agents and blocks profile bypass edges", async () => {
    const migration = await readText("apps/web/drizzle/0016_tool_profiles.sql");
    const schema = await readText("apps/web/src/server/db/schema.ts");
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    const trust = await readText("apps/web/src/server/routers/trust.ts");

    assert.match(migration, /DEFAULT 'full'/, "migration must preserve existing agents by defaulting to full");
    assert.match(schema, /default\("full"\)/, "schema default must match compatibility migration");
    assert.match(
      route,
      /`mcp:\$\{tool\.name\}`/,
      "MCP filtering must evaluate a source-prefixed tool id to avoid name collisions",
    );
    assert.match(
      route,
      /runtimeTools\.includes\("read_file"\)/,
      "KB read_file overlay must require selected read_file access",
    );
    assert.match(
      route,
      /recordToolProfileAuditEvent/,
      "profile denials and unexposed tool calls must be audit-visible",
    );
    assert.match(trust, /id: "generate_image"/, "trust catalog must include image generation metadata");
    assert.match(trust, /id: "visual_understanding"/, "trust catalog must include vision fallback metadata");
  });

  it("AI builder preserves profile and deny-list fields in generated drafts", async () => {
    const server = await readText("apps/web/src/server/agent-builder.ts");
    const router = await readText("apps/web/src/server/routers/agentBuilder.ts");

    assert.match(server, /toolProfileSchema/, "AI builder patch schema must validate tool profile");
    assert.match(server, /deniedTools: z\.array/, "AI builder patch schema must validate deny lists");
    assert.match(server, /toolProfile:/, "AI builder drafts must carry a selected tool profile");
    assert.match(server, /deniedTools:/, "AI builder drafts must preserve denied tools");
    assert.match(
      router,
      /toolProfile: agent\.toolProfile/,
      "router must pass persisted profile into the draft context",
    );
    assert.match(
      router,
      /deniedTools: parseJsonStringArray\(agent\.deniedTools\)/,
      "router must pass persisted deny list into the draft context",
    );
  });
});
