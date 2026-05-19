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
    assert.match(src, /data-testid="pattern-visualizer"/, "must expose a stable visualizer test id");
    assert.doesNotMatch(src, /MermaidBlock/, "group visualizer must not depend on Mermaid runtime rendering");
  });

  it("MermaidBlock uses a Trusted Types policy for sanitized SVG insertion", async () => {
    const src = await readText("apps/web/src/components/MermaidBlock.tsx");
    assert.match(src, /agenthub-mermaid/, "must use a dedicated Mermaid Trusted Types policy");
    assert.match(src, /createTrustedMermaidHtml/, "must route Mermaid SVG through trusted HTML creation");
    assert.match(src, /sanitizeArtifactHtml/, "trusted HTML policy must sanitize Mermaid SVG");
    assert.match(src, /DOMParser/, "must parse sanitized Mermaid SVG without assigning innerHTML");
    assert.match(src, /securityLevel: "sandbox"/, "must render Mermaid in sandbox mode under Trusted Types CSP");
    assert.doesNotMatch(src, /innerHTML/, "must not use innerHTML for Mermaid SVG insertion");
  });

  it("buildDiagram handles sequential pattern with chain arrows", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /sequential/, "must handle sequential pattern");
    assert.match(src, /buildPatternGraph/, "must build a typed graph");
    assert.match(src, /graphNodes\.slice\(0, -1\)/, "must chain sequential nodes");
  });

  it("buildDiagram handles parallel pattern with fan-out and synthesis", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /parallel/, "must handle parallel pattern");
    assert.match(src, /id: "input", label: "Task"/, "must include input Task node");
    assert.match(src, /Synthesis/, "must include synthesis node");
    assert.match(src, /fan out/, "must show fan-out edge labels");
  });

  it("buildDiagram handles supervisor pattern with delegate/result edges", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /supervisor/, "must handle supervisor pattern");
    assert.match(src, /delegate/, "must show delegate edges");
    assert.match(src, /result/, "must show result edges back to supervisor");
  });

  it("buildPatternGraph handles iterative author editor reviser checkpoints", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /iterative/, "must handle iterative pattern");
    assert.match(src, /Author/, "must include author fallback");
    assert.match(src, /Editor/, "must include editor fallback");
    assert.match(src, /Reviser/, "must include reviser fallback");
    assert.match(src, /review checkpoint/, "must show checkpoint edge");
  });

  it("buildDiagram handles debate pattern with moderator", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /debate/, "must handle debate pattern");
    assert.match(src, /moderator/, "must detect moderator role");
    assert.match(src, /counter/, "must show reverse debate edges");
  });

  it("buildDiagram handles groupchat pattern as a cycle", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /groupchat/, "must handle groupchat pattern");
    assert.match(src, /\(index \+ 1\) % graphNodes\.length/, "must compute cycle modulo member count");
  });

  it("placeholder nodes shown when no members provided", async () => {
    const src = await readText("apps/web/src/components/PatternVisualizer.tsx");
    assert.match(src, /placeholder/, "must have placeholder node ids");
    assert.match(src, /Agent \$\{index \+ 1\}/, "must label placeholder nodes with index");
  });

  it("PatternVisualizer embedded in AgentGroupBuilder", async () => {
    const src = await readText("apps/web/src/components/AgentGroupBuilder.tsx");
    assert.match(src, /PatternVisualizer/, "must import and use PatternVisualizer");
    assert.match(src, /form\.pattern/, "must pass form.pattern to visualizer");
    assert.match(src, /agentName/, "must resolve agent names for visualizer");
  });
});
