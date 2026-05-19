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

describe("Branching modes", () => {
  it("sessions.fork accepts continuation and standalone modes with continuation as default", async () => {
    const router = await readText("apps/web/src/server/routers/sessions.ts");

    assert.match(router, /mode: z\.enum\(\["continuation", "standalone"\]\)\.optional\(\)/);
    assert.match(router, /const branchMode = input\.mode \?\? "continuation"/);
    assert.match(router, /branchMode === "standalone"/);
  });

  it("forking validates the fork point belongs to the source session", async () => {
    const router = await readText("apps/web/src/server/routers/sessions.ts");

    assert.match(router, /and\(eq\(messages\.id, input\.messageId\), eq\(messages\.sessionId, input\.id\)\)/);
    assert.doesNotMatch(router, /where\(eq\(messages\.id, input\.messageId\)\)\.limit\(1\)/);
  });

  it("continuation copies prior context and standalone copies only the selected message", async () => {
    const router = await readText("apps/web/src/server/routers/sessions.ts");

    assert.match(
      router,
      /const continuationMessages = forkIndex >= 0 \? msgsToCopy\.slice\(0, forkIndex \+ 1\) : \[\]/,
    );
    assert.match(router, /const messagesToCopy = branchMode === "standalone" \? \[forkPoint\] : continuationMessages/);
    assert.match(router, /branchMode/);
    assert.match(router, /metadata: \{ branchMode/);
  });

  it("chat UI exposes explicit branch mode controls", async () => {
    const [chatMessage, virtualized, chatInterface] = await Promise.all([
      readText("apps/web/src/components/ChatMessage.tsx"),
      readText("apps/web/src/components/VirtualizedMessageList.tsx"),
      readText("apps/web/src/components/ChatInterface.tsx"),
    ]);

    assert.match(chatMessage, /type BranchMode = "continuation" \| "standalone"/);
    assert.match(chatMessage, /data-testid="branch-mode-controls"/);
    assert.match(chatMessage, /Standalone/);
    assert.match(virtualized, /mode\?: BranchMode/);
    assert.match(
      chatInterface,
      /handleBranch = useCallback\(\s*\(messageId: string, mode: BranchMode = "continuation"\)/,
    );
    assert.match(chatInterface, /forkSession\.mutate\(\{\s*id: activeSessionId, messageId, mode\s*\}\)/);
  });

  it("branch navigator labels branch modes and keeps tree navigation visible", async () => {
    const navigator = await readText("apps/web/src/components/BranchNavigator.tsx");

    assert.match(navigator, /branchModeLabel/);
    assert.match(navigator, /Continuation/);
    assert.match(navigator, /Standalone/);
    assert.match(navigator, /Branch \{display \+ 1\} of \{branches\.length\}/);
  });

  it("browser branching spec covers continuation and standalone controls", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-b/branching.spec.ts");

    assert.match(spec, /Continuation/);
    assert.match(spec, /Standalone/);
    assert.match(spec, /Branch from here only/);
  });
});
