import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("P43.1 CLI routes commit, i18n, and label toolbox commands", async () => {
  const index = await readText("packages/agenthub-cli/src/index.ts");

  assert.match(index, /runCommitCommand/, "CLI must import commit command");
  assert.match(index, /runI18nCommand/, "CLI must import i18n command");
  assert.match(index, /runLabelCommand/, "CLI must import label command");
  assert.match(index, /scope === "commit"/, "CLI must route agenthub commit");
  assert.match(index, /scope === "i18n"/, "CLI must route agenthub i18n");
  assert.match(index, /scope === "label"/, "CLI must route agenthub label");
  assert.match(index, /agenthub commit/, "usage must document commit");
  assert.match(index, /agenthub i18n/, "usage must document i18n");
  assert.match(index, /agenthub label/, "usage must document label");
});

test("P43.1 commit helper generates dry-run conventional commits from git state", async () => {
  const src = await readText("packages/agenthub-cli/src/commit.ts");

  assert.match(src, /parseCommitArgs/, "commit command must parse args");
  assert.match(src, /generateCommitMessage/, "commit command must generate a message");
  assert.match(src, /execFile/, "commit command must use structured git execution");
  assert.match(src, /git/, "commit command must inspect git state");
  assert.match(src, /--write/, "commit command must require explicit write flag");
  assert.match(src, /dryRun: true/, "commit command must default to dry-run");
  assert.match(src, /ConventionalCommitType/, "commit command must model conventional commit types");
});

test("P43.1 i18n helper checks and optionally fills local message keys", async () => {
  const src = await readText("packages/agenthub-cli/src/i18n.ts");

  assert.match(src, /parseI18nArgs/, "i18n command must parse args");
  assert.match(src, /flattenMessageKeys/, "i18n command must compare nested message keys");
  assert.match(src, /findMissingTranslationKeys/, "i18n command must report missing translations");
  assert.match(src, /apps\/web\/messages/, "i18n command must default to AgentHub message files");
  assert.match(src, /--write/, "i18n command must require explicit write flag");
  assert.match(src, /dryRun: true/, "i18n command must default to dry-run");
});

test("P43.1 label helper syncs explicit label sources in dry-run mode by default", async () => {
  const src = await readText("packages/agenthub-cli/src/label.ts");

  assert.match(src, /parseLabelArgs/, "label command must parse args");
  assert.match(src, /readLabelSource/, "label command must require a source file");
  assert.match(src, /planLabelSync/, "label command must build a deterministic sync plan");
  assert.match(src, /--source/, "label command must require explicit source");
  assert.match(src, /--target/, "label command must support explicit target");
  assert.match(src, /--target-file/, "label command must support file-backed sync tests");
  assert.match(src, /--write/, "label command must require explicit write flag");
  assert.match(src, /dryRun: true/, "label command must default to dry-run");
});
