import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

test("web package installs Monaco editor dependencies", async () => {
  const pkg = await readJson("apps/web/package.json");
  assert.equal(pkg.dependencies["@monaco-editor/react"], "^4.7.0");
  assert.equal(pkg.dependencies["monaco-editor"], "^0.55.1");
});

test("Code workspace renders Monaco and sandbox-backed Python execution", async () => {
  const [workspace, sandboxRouter] = await Promise.all([
    readText("apps/web/src/components/CodeWorkspace.tsx"),
    readText("apps/web/src/server/routers/sandbox.ts"),
  ]);

  assert.match(workspace, /dynamic\(\(\) => import\("@monaco-editor\/react"\)/);
  assert.match(workspace, /data-testid="monaco-code-workspace"/);
  assert.match(workspace, /data-testid="monaco-editor"/);
  assert.match(workspace, /trpc\.sandbox\.executeCode\.useMutation/);
  assert.match(workspace, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(workspace, /Run Python/);
  assert.match(sandboxRouter, /executeCode: authedProcedure/);
  assert.match(sandboxRouter, /executePython\(input\.code\)/);
  assert.match(sandboxRouter, /z\.literal\("python"\)/);
});

test("Code route is reachable from persistent route chrome and sidebar", async () => {
  const [page, frame, sidebar] = await Promise.all([
    readText("apps/web/src/app/code/page.tsx"),
    readText("apps/web/src/components/AppRouteFrame.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
  ]);

  assert.match(page, /<CodeWorkspace \/>/);
  assert.match(frame, /"\/code"/, "persistent route nav must include Code");
  assert.match(frame, /Code2/, "route nav should use a code icon");
  assert.match(sidebar, /label="Code"/, "sidebar must include Code navigation");
});
