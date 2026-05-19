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

describe("P40.5 Agent Working Panel", () => {
  it("panel component renders tabs for documents, tasks, run logs, citations, and document history", async () => {
    const src = await readText("apps/web/src/components/AgentWorkingPanel.tsx");
    assert.match(src, /data-testid="agent-working-panel"/, "panel must be browser-testable");
    assert.match(src, /Active documents/, "panel must show active documents");
    assert.match(src, /Task progress/, "panel must show task progress");
    assert.match(src, /Run logs/, "panel must show run logs");
    assert.match(src, /Citations/, "panel must show citations");
    assert.match(src, /Document history/, "panel must show document history");
  });

  it("panel reuses existing routers and chat message metadata", async () => {
    const src = await readText("apps/web/src/components/AgentWorkingPanel.tsx");
    assert.match(src, /trpc\.tasks\.list\.useQuery/, "panel must query task progress");
    assert.match(src, /trpc\.pages\.list\.useQuery/, "panel must query active pages/documents");
    assert.match(src, /trpc\.pages\.versions\.useQuery/, "panel must query document history");
    assert.match(src, /trpc\.automations\.list\.useQuery/, "panel must query scheduled run state");
    for (const key of [
      "ragSources",
      "generatedResources",
      "sandboxResources",
      "artifacts",
      "reasoningTimeline",
      "routeDecision",
    ]) {
      assert.match(src, new RegExp(key), `panel must use ${key}`);
    }
  });

  it("ChatInterface opens the working panel without resetting the active conversation", async () => {
    const src = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(src, /AgentWorkingPanel/, "chat must render working panel");
    assert.match(src, /workingPanelOpen/, "chat must keep local open state");
    assert.match(src, /data-testid="working-panel-toggle"/, "chat must expose a working panel toggle");
    assert.match(src, /session={activeSession}/, "panel must receive the current active session");
    assert.doesNotMatch(src, /setActiveSession\([^)]*workingPanelOpen/, "panel toggle must not switch sessions");
  });

  it("working panel browser spec opens the real chat panel", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/working-panel.spec.ts");
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
    assert.match(spec, /working-panel-toggle/, "browser coverage must open the real chat toggle");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
  });
});
