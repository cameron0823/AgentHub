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

describe("Inline prompt refinement", () => {
  it("defines deterministic pre-send prompt refinement modes", async () => {
    const refinement = await readText("apps/web/src/lib/prompt-refinement.ts");

    assert.match(refinement, /PromptRefinementMode/, "must define stable refinement mode type");
    for (const mode of ["rewrite", "translate", "shorten", "expand", "media"]) {
      assert.match(refinement, new RegExp(mode), `must support ${mode}`);
    }
    assert.match(refinement, /PROMPT_REFINEMENT_ACTIONS/, "must export composer action metadata");
    assert.match(refinement, /refinePrompt/, "must expose a single refinement entrypoint");
    assert.match(refinement, /normalizePromptInput/, "must normalize whitespace without sending a message");
  });

  it("chat input exposes refinement actions and updates the draft in place", async () => {
    const input = await readText("apps/web/src/components/ChatInput.tsx");

    assert.match(input, /refinePrompt/, "composer must call the local refiner");
    assert.match(
      input,
      /EDITOR_AI_COMPLETE_ACTIONS/,
      "composer must render all refinement actions from the editor kernel",
    );
    assert.match(
      input,
      /@agenthub\/editor-kernel\/plugins\/ai-complete/,
      "composer must consume the lightweight editor action contract",
    );
    assert.match(input, /data-testid="prompt-refinement-actions"/, "composer must expose action container");
    assert.match(input, /aria-label=\{action\.label\}/, "composer must expose action labels to assistive tech");
    assert.match(input, /setInput\(refinePrompt\(input, mode\)\)/, "refinement must mutate the current draft only");
    assert.doesNotMatch(input, /onSend\(refinePrompt/, "refinement must not send a chat message");
  });

  it("browser spec covers pre-send prompt refinement controls", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/prompt-refinement.spec.ts");

    assert.match(spec, /inline prompt refinement/i);
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate to the real app");
    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must not use synthetic HTML");
    assert.match(spec, /prompt-refinement-actions/);
    assert.match(spec, /Rewrite prompt/);
    assert.match(spec, /Optimize media prompt/);
    assert.match(spec, /toHaveValue/, "browser coverage must verify draft mutation");
  });
});
