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

test("sessions.branchTree builds a user-scoped session ancestry tree", async () => {
  const router = await readText("apps/web/src/server/routers/sessions.ts");

  assert.match(router, /branchTree: authedProcedure/);
  assert.match(router, /sessionId: z\.string\(\)\.uuid\(\)/);
  assert.match(router, /eq\(chatSessions\.id, input\.sessionId\), eq\(chatSessions\.userId, ctx\.user\.id\)/);
  assert.match(router, /eq\(chatSessions\.userId, ctx\.user\.id\)/);
  assert.match(router, /parentSessionIdFor/);
  assert.match(router, /forkedFromMessageIdFor/);
  assert.match(router, /treeSessionIds/);
  assert.match(router, /nodeCount: nodesById\.size/);
});

test("branch navigator renders a clickable branch tree visualization", async () => {
  const navigator = await readText("apps/web/src/components/BranchNavigator.tsx");

  assert.match(navigator, /trpc\.sessions\.branchTree\.useQuery/);
  assert.match(navigator, /data-testid="branch-tree-visualization"/);
  assert.match(navigator, /Conversation branch tree/);
  assert.match(navigator, /GitBranch/);
  assert.match(navigator, /onClick=\{\(\) => onSwitch\(node\.id\)\}/);
  assert.match(navigator, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(navigator, /branchModeName/);
});

test("chat interface keeps branch visualization available from root sessions", async () => {
  const chatInterface = await readText("apps/web/src/components/ChatInterface.tsx");

  assert.match(chatInterface, /<BranchNavigator\s+parentMessageId=\{activeSession\.parentMessageId\}/);
  assert.doesNotMatch(chatInterface, /activeSession\.parentMessageId && \(\s*<BranchNavigator/);
});
