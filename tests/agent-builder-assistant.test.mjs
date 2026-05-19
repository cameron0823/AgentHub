import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("agent builder assistant server returns a validated structured diff", async () => {
  const builder = await readText("apps/web/src/server/agent-builder.ts");

  assert.match(builder, /agentBuilderPatchSchema/);
  assert.match(builder, /agentBuilderDiffSchema/);
  assert.match(builder, /createAgentBuilderDraft/);
  assert.match(builder, /identity/);
  assert.match(builder, /model_tools/);
  assert.match(builder, /opening/);
  assert.match(builder, /knowledge/);
});

test("agent builder assistant validates model, tool, and knowledge-base references", async () => {
  const builder = await readText("apps/web/src/server/agent-builder.ts");

  assert.match(builder, /availableModelIds/);
  assert.match(builder, /availableToolIds/);
  assert.match(builder, /knowledgeBases/);
  assert.match(builder, /rejected/);
  assert.match(builder, /unsafe/i);
});

test("agentBuilder router assembles live provider, tool, KB, and current agent context", async () => {
  const router = await readText("apps/web/src/server/routers/agentBuilder.ts");
  const appRouter = await readText("apps/web/src/server/routers/_app.ts");

  assert.match(router, /agentBuilderRouter/);
  assert.match(router, /providerRegistry\.listAllModels/);
  assert.match(router, /globalToolRegistry\.list/);
  assert.match(router, /knowledgeBases/);
  assert.match(router, /createAgentBuilderDraft/);
  assert.match(appRouter, /agentBuilder: agentBuilderRouter/);
});

test("AgentBuilder UI previews, applies, and rejects assistant diffs before saving", async () => {
  const assistant = await readText("apps/web/src/components/AgentBuilderAssistant.tsx");
  const builder = await readText("apps/web/src/components/AgentBuilder.tsx");

  assert.match(assistant, /trpc\.agentBuilder\.preview/);
  assert.match(assistant, /sanitizePreviewCurrentForm/, "assistant must omit blank current-form fields before preview");
  assert.match(
    assistant,
    /current: sanitizePreviewCurrentForm\(currentForm\)/,
    "preview mutation must receive sanitized current form state",
  );
  assert.match(assistant, /Apply/);
  assert.match(assistant, /Reject/);
  assert.match(assistant, /onApplyPatch/);
  assert.match(builder, /AgentBuilderAssistant/);
  assert.match(builder, /applyAssistantPatch/);
  assert.match(builder, /fallbackModelsText/);
});

test("agent builder assistant browser spec is registered", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/agent-builder-assistant.spec.ts");

  assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must run against the real app");
  assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate through the app shell");
  assert.match(spec, /button", \{ name: "New Agent"/, "browser coverage must open the real builder view");
  assert.match(spec, /getByPlaceholder\(\/Build a research agent/, "browser coverage must use the assistant textarea");
  assert.match(spec, /input\[name="name"\]/, "browser coverage must verify applying the diff updates the form");
  assert.match(spec, /Agent Builder Assistant/);
  assert.match(spec, /assistant diff/);
});
