import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("accepted memory injection is scoped by user as well as agent", async () => {
  const [helper, chatRoute, publicChatRoute, a2aHelper, webhook] = await Promise.all([
    readText("apps/web/src/server/memory.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/app/api/v1/chat/completions/route.ts"),
    readText("apps/web/src/server/a2a.ts"),
    readText("apps/web/src/server/channels/webhook.ts"),
  ]);

  assert.match(helper, /fetchAcceptedMemoriesForAgent\(agentId: string, userId: string\)/);
  assert.match(helper, /eq\(memoryEntries\.userId, userId\)/);
  assert.match(chatRoute, /fetchAcceptedMemoriesForAgent\(runtimeAgent\.id, session\.user\.id\)/);
  assert.match(publicChatRoute, /fetchAcceptedMemoriesForAgent\(agent\.id, userId\)/);
  assert.match(a2aHelper, /fetchAcceptedMemoriesForAgent\(agent\.id, input\.userId\)/);
  assert.match(webhook, /fetchAcceptedMemoriesForAgent\(agent\.id, agent\.userId\)/);
});

test("memory approval flow supports persistent pending review and bulk decisions", async () => {
  const [router, editor] = await Promise.all([
    readText("apps/web/src/server/routers/memory.ts"),
    readText("apps/web/src/components/MemoryEditor.tsx"),
  ]);

  assert.match(router, /bulkSetStatus: authedProcedure/);
  assert.match(router, /eq\(memoryEntries\.status, "proposed"\)/);
  assert.match(router, /inArray\(memoryEntries\.id, input\.ids\)/);
  assert.match(editor, /pendingQuery = trpc\.memoryEntries\.list\.useQuery\(\{ status: "proposed" \}\)/);
  assert.match(editor, /trpc\.memoryEntries\.bulkSetStatus\.useMutation/);
  assert.match(editor, /Accept all proposed/);
  assert.match(editor, /Reject all proposed/);
});
