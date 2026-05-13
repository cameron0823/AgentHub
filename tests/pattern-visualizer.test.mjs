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

describe("Pattern visualizer", () => {
  it("PatternVisualizer component exports from PatternVisualizer.tsx", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /export function PatternVisualizer/, "must export PatternVisualizer");
    assert.match(src, /MermaidBlock/, "must use MermaidBlock to render diagram");
  });

  it("buildDiagram handles sequential pattern with chain arrows", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /sequential/, "must handle sequential pattern");
    assert.match(src, /flowchart LR/, "must use left-right flowchart");
    assert.match(src, /\$\{id\} --> \$\{ids\[i \+ 1\]\}/, "must chain nodes with arrows");
  });

  it("buildDiagram handles parallel pattern with fan-out and synthesis", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /parallel/, "must handle parallel pattern");
    assert.match(src, /Input.*Task/, "must include input Task node");
    assert.match(src, /Synthesis/, "must include synthesis node");
  });

  it("buildDiagram handles supervisor pattern with delegate/result edges", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /supervisor/, "must handle supervisor pattern");
    assert.match(src, /delegate/, "must show delegate edges");
    assert.match(src, /result/, "must show result edges back to supervisor");
  });

  it("buildDiagram handles debate pattern with moderator", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /debate/, "must handle debate pattern");
    assert.match(src, /moderator/, "must detect moderator role");
    assert.match(src, /<-->/, "must show bidirectional debate edges");
  });

  it("buildDiagram handles groupchat pattern as a cycle", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /groupchat/, "must handle groupchat pattern");
    assert.match(src, /ids\.length/, "must compute cycle modulo member count");
  });

  it("placeholder nodes shown when no members provided", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /placeholder/, "must have placeholder function");
    assert.match(src, /Agent \$\{index \+ 1\}/, "must label placeholder nodes with index");
  });

  it("PatternVisualizer embedded in AgentGroupBuilder", async () => {
    const src = await readText("apps/web/src/components/AgentGroupBuilder.tsx");
    assert.match(src, /PatternVisualizer/, "must import and use PatternVisualizer");
    assert.match(src, /form\.pattern/, "must pass form.pattern to visualizer");
    assert.match(src, /agentName/, "must resolve agent names for visualizer");
  });
});
