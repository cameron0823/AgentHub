import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("P43.3 editor kernel package exposes React binding and plugin contracts", async () => {
  const [pkg, index, markdownPlugin, aiCompletePlugin, tsconfig] = await Promise.all([
    readJson("packages/editor-kernel/package.json"),
    readText("packages/editor-kernel/src/index.ts"),
    readText("packages/editor-kernel/src/plugins/markdown.ts"),
    readText("packages/editor-kernel/src/plugins/ai-complete.ts"),
    readText("packages/editor-kernel/tsconfig.json"),
  ]);

  assert.equal(pkg.name, "@agenthub/editor-kernel");
  assert.equal(pkg.main, "./src/index.ts");
  assert.match(pkg.scripts.typecheck, /tsc --noEmit/);
  assert.match(pkg.scripts.build, /tsc/);
  assert.match(pkg.dependencies["@lexical/markdown"], /^\^?0\.44\./);
  assert.match(pkg.dependencies["@lexical/react"], /^\^?0\.44\./);
  assert.match(tsconfig, /"jsx": "react-jsx"/);

  for (const exported of [
    "PageEditorKernel",
    "PageEditorSelection",
    "MARKDOWN_TRANSFORMERS",
    "exportEditorRootToMarkdown",
    "importMarkdownToEditorRoot",
    "EDITOR_AI_COMPLETE_ACTIONS",
    "normalizeEditorDraft",
  ]) {
    assert.match(index, new RegExp(exported), `@agenthub/editor-kernel must export ${exported}`);
  }

  assert.match(markdownPlugin, /\$convertToMarkdownString/);
  assert.match(markdownPlugin, /\$convertFromMarkdownString/);
  assert.match(aiCompletePlugin, /EDITOR_AI_COMPLETE_ACTIONS/);
  assert.match(aiCompletePlugin, /createEditorAiCompleteRequest/);
});

test("P43.3 editor React binding keeps Lexical editor behavior reusable", async () => {
  const editor = await readText("packages/editor-kernel/src/react/PageEditorKernel.tsx");

  assert.match(editor, /LexicalComposer/, "editor must use LexicalComposer");
  assert.match(editor, /RichTextPlugin/, "editor must use RichTextPlugin");
  assert.match(editor, /ContentEditable/, "editor must render ContentEditable");
  assert.match(editor, /HistoryPlugin/, "editor must include history");
  assert.match(editor, /MarkdownShortcutPlugin/, "editor must support markdown shortcuts");
  assert.match(editor, /importMarkdownToEditorRoot/, "editor must import markdown through the package plugin");
  assert.match(editor, /exportEditorRootToMarkdown/, "editor must export markdown through the package plugin");
  assert.match(editor, /onSelectionAction/, "editor must expose comments and selection actions");
  assert.match(editor, /data-testid="page-editor-kernel"/, "editor must have a stable test id");
});

test("P43.3 web app consumes editor kernel package from Pages and chat input", async () => {
  const [wrapper, manager, input, promptRefinement, webPkg, webTsconfig, nextConfig] = await Promise.all([
    readText("apps/web/src/components/PageEditorKernel.tsx"),
    readText("apps/web/src/components/PagesManager.tsx"),
    readText("apps/web/src/components/ChatInput.tsx"),
    readText("apps/web/src/lib/prompt-refinement.ts"),
    readJson("apps/web/package.json"),
    readText("apps/web/tsconfig.json"),
    readText("apps/web/next.config.js"),
  ]);

  assert.match(wrapper, /@agenthub\/editor-kernel/, "legacy app component path must re-export the shared kernel");
  assert.match(manager, /@agenthub\/editor-kernel/, "PagesManager must consume the package directly");
  assert.match(input, /EDITOR_AI_COMPLETE_ACTIONS/, "ChatInput must use the shared AI-complete action contract");
  assert.match(
    input,
    /@agenthub\/editor-kernel\/plugins\/ai-complete/,
    "ChatInput must not import the full Lexical binding for lightweight actions",
  );
  assert.match(promptRefinement, /normalizeEditorDraft/, "prompt refinement must share editor draft normalization");
  assert.equal(webPkg.dependencies["@agenthub/editor-kernel"], "workspace:*");
  assert.match(webTsconfig, /"@agenthub\/editor-kernel"/);
  assert.match(nextConfig, /transpilePackages:\s*\[[^\]]*"@agenthub\/editor-kernel"/);
});
