import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("agenthub-cli package exposes an agenthub binary and workspace build scripts", async () => {
  const [pkg, workspace] = await Promise.all([
    readJson("packages/agenthub-cli/package.json"),
    readText("pnpm-workspace.yaml"),
  ]);

  assert.equal(pkg.name, "@agenthub/cli");
  assert.equal(pkg.bin.agenthub, "dist/index.js");
  assert.match(pkg.scripts.build, /tsc/);
  assert.match(pkg.scripts.typecheck, /tsc --noEmit/);
  assert.match(pkg.scripts.test, /agenthub-cli\.test\.mjs/);
  assert.match(workspace, /packages\/\*/);
});

test("agenthub CLI routes hetero exec subcommand and reports usage errors", async () => {
  const index = await readText("packages/agenthub-cli/src/index.ts");

  assert.match(index, /#!\/usr\/bin\/env node/);
  assert.match(index, /runAgentHubCli/);
  assert.match(index, /hetero/);
  assert.match(index, /exec/);
  assert.match(index, /printUsage/);
  assert.match(index, /process\.exitCode = 1/);
});

test("hetero exec parses agent and input file arguments into the API request shape", async () => {
  const src = await readText("packages/agenthub-cli/src/hetero-exec.ts");

  assert.match(src, /parseHeteroExecArgs/);
  assert.match(src, /--agent/);
  assert.match(src, /--input/);
  assert.match(src, /readFile/);
  assert.match(src, /agentId: parsed\.agentId/);
  assert.match(src, /inputFileName/);
  assert.match(src, /args: parsed\.args/);
  assert.match(src, /stream: true/);
  assert.match(src, /AGENTHUB_API_URL/);
  assert.match(src, /AGENTHUB_API_KEY/);
  assert.match(src, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(src, /\/api\/cli\/hetero\/exec/);
});

test("hetero exec supports headless HITL prompts and callback approvals", async () => {
  const src = await readText("packages/agenthub-cli/src/hetero-exec.ts");

  assert.match(src, /hitl_request/);
  assert.match(src, /promptForApproval/);
  assert.match(src, /readline\/promises/);
  assert.match(src, /submitHitlDecision/);
  assert.match(src, /approved/);
  assert.match(src, /--yes/);
  assert.match(src, /--non-interactive/);
});

test("CLI hetero exec API route authenticates API keys, persists session state, and streams runner output", async () => {
  const route = await readText("apps/web/src/app/api/cli/hetero/exec/route.ts");

  assert.match(route, /validateApiKey/);
  assert.match(route, /Authorization/);
  assert.match(route, /heterogeneousAgentProfiles/);
  assert.match(route, /eq\(heterogeneousAgentProfiles\.userId, userId\)/);
  assert.match(route, /chatSessions/);
  assert.match(route, /messagesTable/);
  assert.match(route, /heterogeneousAgentRuns/);
  assert.match(route, /runHeterogeneousAgent/);
  assert.match(route, /sessionId/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /type: "done"/);
});
