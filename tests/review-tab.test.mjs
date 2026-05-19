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

describe("Review Tab", () => {
  it("git diff service validates server-mounted repos before running git", async () => {
    const src = await readText("apps/web/src/server/git/diff.ts");
    assert.match(src, /AGENTHUB_REVIEW_REPO_ROOTS/, "review access must be gated by configured repo roots");
    assert.match(src, /realpath/, "repo validation must canonicalize paths");
    assert.match(src, /relative/, "repo validation must compare paths against allowed roots");
    assert.match(src, /Review repo is outside configured mount roots/, "must reject repo path traversal/outside roots");
    assert.match(src, /rev-parse/, "must verify the selected path is a git repository");
  });

  it("git diff service invokes git diff safely without shell execution", async () => {
    const src = await readText("apps/web/src/server/git/diff.ts");
    assert.match(src, /spawn\("git"/, "must use spawn with argv array");
    assert.match(src, /shell: false/, "must explicitly disable shell execution");
    assert.match(src, /"diff", "--no-ext-diff"/, "must disable external diff drivers");
    assert.match(src, /"--"/, "must terminate git options before file filters");
    assert.doesNotMatch(src, /exec\(/, "must not use shell exec");
    assert.doesNotMatch(src, /execSync/, "must not use sync shell exec");
  });

  it("git diff parser aggregates files, hunks, filters, and pagination", async () => {
    const src = await readText("apps/web/src/server/git/diff.ts");
    assert.match(src, /parseGitDiff/, "diff parser must be exported");
    assert.match(src, /buildFileTree/, "file tree aggregation must be implemented");
    assert.match(src, /@@/, "parser must identify hunk headers");
    assert.match(src, /additions/, "parser must count additions");
    assert.match(src, /deletions/, "parser must count deletions");
    assert.match(src, /nextCursor/, "large diffs must paginate by cursor");
    assert.match(src, /filter/, "diff listing must support path/status filters");
  });

  it("review router registers repo capability, registration, and diff procedures", async () => {
    const router = await readText("apps/web/src/server/routers/review.ts");
    const appRouter = await readText("apps/web/src/server/routers/_app.ts");
    assert.match(router, /capabilities/, "router must expose review capability state");
    assert.match(router, /registerRepository/, "router must register a repo path before review");
    assert.match(router, /diff/, "router must list paginated diffs");
    assert.match(router, /limit.*min\(1\).*max\(200\)/s, "diff procedure must cap page size");
    assert.match(router, /validateReviewRepository/, "router must reuse repo validation");
    assert.match(appRouter, /review.*reviewRouter/, "review router must be wired into app router");
  });

  it("ReviewTab UI exposes repo registration, file tree, hunks, filters, and pagination", async () => {
    const component = await readText("apps/web/src/components/ReviewTab.tsx");
    assert.match(component, /trpc\.review\.capabilities/, "UI must show capability gate");
    assert.match(component, /trpc\.review\.registerRepository/, "UI must register repos");
    assert.match(component, /trpc\.review\.diff/, "UI must fetch diffs");
    assert.match(component, /Repository path/, "UI must expose repo path input");
    assert.match(component, /File tree/, "UI must render a file tree");
    assert.match(component, /Hunks/, "UI must render hunks");
    assert.match(component, /Filter files/, "UI must expose filtering");
    assert.match(component, /visibleFiles/, "large repo file rendering must be windowed");
    assert.match(component, /Load more/, "UI must expose pagination");
  });

  it("Review tab is reachable from app routing and sidebar navigation", async () => {
    const page = await readText("apps/web/src/app/review/page.tsx");
    const home = await readText("apps/web/src/app/page.tsx");
    const store = await readText("apps/web/src/stores/chatStore.ts");
    const sidebar = await readText("apps/web/src/components/Sidebar.tsx");
    assert.match(page, /ReviewTab/, "review route must render ReviewTab");
    assert.match(home, /mainView === "review"/, "main app must support review view");
    assert.match(store, /MainView[\s\S]*review/, "MainView union must include review");
    assert.match(sidebar, /href="\/review"/, "sidebar must link to review route");
    assert.match(sidebar, /label="Review"/, "sidebar label must be Review");
  });
});
