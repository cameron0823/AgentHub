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

describe("Sandbox output workflow", () => {
  it("execute_code returns sandbox sessions with downloadable outputs and chart metadata while preserving Docker isolation", async () => {
    const tool = await readText("packages/agent-runtime/src/tools/builtin/executeCode.ts");

    assert.match(tool, /type: "sandbox_execution"/, "tool result must identify sandbox execution payloads");
    assert.match(tool, /sessionId/, "tool result must include sandbox session id");
    assert.match(tool, /outputs/, "tool result must include downloadable outputs");
    assert.match(tool, /charts/, "tool result must include chart metadata");
    assert.match(tool, /AGENTHUB_SANDBOX_PROVIDER/, "tool must support optional provider selection");
    assert.match(tool, /AGENTHUB_SANDBOX_IMAGE/, "tool must allow configured local image");
    assert.match(tool, /spawn\("docker"/, "local mode must keep Docker execution");
    assert.match(tool, /"--network",\s*"none"/, "Docker execution must stay network isolated");
    assert.match(tool, /"--read-only"/, "Docker execution must keep read-only root filesystem");
    assert.match(tool, /"--cap-drop",\s*"ALL"/, "Docker execution must drop Linux capabilities");
    assert.match(tool, /"--security-opt",\s*"no-new-privileges"/, "Docker execution must block privilege escalation");
    assert.match(tool, /AGENTHUB_SANDBOX_SECCOMP_PROFILE/, "Docker execution must support configured seccomp profile");
    assert.match(
      tool,
      /AGENTHUB_SANDBOX_APPARMOR_PROFILE/,
      "Docker execution must support configured AppArmor profile",
    );
    assert.match(tool, /"--pids-limit",\s*"128"/, "Docker execution must cap process fanout");
    assert.match(tool, /proc\.stdin\.write\(code\)/, "user code must still be passed through stdin");
  });

  it("server sandbox module stores sessions, persists resources, and supports downloads", async () => {
    const sandbox = await readText("apps/web/src/server/sandbox.ts");
    const schema = await readText("apps/web/src/server/db/schema.ts");

    for (const symbol of [
      "SandboxSession",
      "SandboxOutput",
      "SANDBOX_OUTPUT_TTL_MS",
      "createSandboxSession",
      "createSandboxSessionFromToolResult",
      "persistSandboxOutputs",
      "downloadSandboxOutput",
    ]) {
      assert.match(sandbox, new RegExp(symbol), `sandbox module must expose ${symbol}`);
    }
    assert.match(sandbox, /"--cap-drop",\s*"ALL"/, "server sandbox fallback must drop Linux capabilities");
    assert.match(
      sandbox,
      /"--security-opt",\s*"no-new-privileges"/,
      "server sandbox fallback must block privilege escalation",
    );
    assert.match(
      sandbox,
      /AGENTHUB_SANDBOX_SECCOMP_PROFILE/,
      "server sandbox fallback must support configured seccomp profile",
    );
    assert.match(
      sandbox,
      /AGENTHUB_SANDBOX_APPARMOR_PROFILE/,
      "server sandbox fallback must support configured AppArmor profile",
    );
    assert.match(
      schema,
      /"image", "file", "chart", "document"/,
      "resources type must support non-image sandbox outputs",
    );
  });

  it("sandbox router exposes authenticated list and download procedures", async () => {
    const router = await readText("apps/web/src/server/routers/sandbox.ts");
    const appRouter = await readText("apps/web/src/server/routers/_app.ts");

    assert.match(router, /listOutputs: authedProcedure/, "router must list user-owned outputs");
    assert.match(router, /downloadOutput: authedProcedure/, "router must download user-owned outputs");
    assert.match(router, /eq\(resources\.userId, ctx\.user\.id\)/, "router must enforce user ownership");
    assert.match(router, /downloadSandboxOutput/, "router must use sandbox download helper");
    assert.match(appRouter, /sandbox: sandboxRouter/, "root router must register sandbox router");
  });

  it("chat stream persists sandbox outputs and UI renders files and charts", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    const chatInterface = await readText("apps/web/src/components/ChatInterface.tsx");
    const chatMessage = await readText("apps/web/src/components/ChatMessage.tsx");
    const output = await readText("apps/web/src/components/SandboxOutput.tsx");

    assert.match(
      route,
      /createSandboxSessionFromToolResult/,
      "chat stream must extract sandbox resources from tool results",
    );
    assert.match(route, /persistSandboxOutputs/, "chat stream must persist sandbox outputs as resources");
    assert.match(route, /sandboxResources/, "chat stream must add sandbox outputs to message metadata");
    assert.match(chatInterface, /sandboxResources/, "chat interface must merge streamed sandbox resources");
    assert.match(chatMessage, /SandboxOutput/, "chat message must render sandbox outputs");
    assert.match(output, /Download/, "sandbox output UI must expose downloads");
    assert.match(output, /chart/, "sandbox output UI must render chart resources");
  });

  it("browser spec covers sandbox output rendering", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/sandbox-workflow.spec.ts");

    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must run against the real app");
    assert.match(spec, /createE2ESessionWithAssistantMetadata/, "browser coverage must seed real chat metadata");
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate through the app shell");
    assert.match(spec, /session-row/, "browser coverage must open the persisted chat session");
    assert.match(spec, /sandboxResources/, "browser coverage must render persisted sandbox resources");
    assert.match(spec, /Sandbox Outputs/);
    assert.match(spec, /Download/);
    assert.match(spec, /Chart/);
  });

  it("runtime tests verify app-backed execute_code allow and profile deny flows", async () => {
    const runtimeTest = await readText("packages/agent-runtime/tests/runtime.test.ts");

    assert.match(runtimeTest, /compileToolProfile/, "test must use app tool-profile policy");
    assert.match(runtimeTest, /selectedTools: \["execute_code"\]/, "test must cover execute_code selection");
    assert.match(runtimeTest, /type: "sandbox_execution"/, "allowed flow must return sandbox output payloads");
    assert.match(runtimeTest, /profile: "minimal"/, "profile-blocked flow must be covered");
    assert.match(runtimeTest, /deniedTools: \["execute_code"\]/, "deny-list blocked flow must be covered");
    assert.match(runtimeTest, /not exposed by the active tool profile/, "profile denial must be asserted");
    assert.match(runtimeTest, /blocked by tool profile deny list/, "deny-list denial must be asserted");
  });
});
