import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home shell exposes mobile navigation and keeps the content area shrinkable", async () => {
  const home = await readText("apps/web/src/app/page.tsx");

  assert.match(home, /data-testid="mobile-app-bar"/, "mobile app bar must be rendered from the home shell");
  assert.match(home, /data-testid="mobile-bottom-nav"/, "mobile bottom nav must be rendered from the home shell");
  assert.match(home, /setSidebarOpen\(true\)/, "mobile chrome must expose the sidebar from every home state");
  assert.match(home, /setSearchOpen\(true\)/, "mobile chrome must expose conversation search");
  assert.match(home, /className="min-h-0 flex-1 overflow-hidden"/, "main content must be allowed to shrink on mobile");
  assert.match(
    home,
    /pb-\[max\(0\.35rem,env\(safe-area-inset-bottom\)\)\]/,
    "bottom nav must respect safe-area insets",
  );
});

test("mobile sidebar stays usable when the desktop sidebar is collapsed", async () => {
  const sidebar = await readText("apps/web/src/components/Sidebar.tsx");

  assert.match(sidebar, /w-\[calc\(100vw-2rem\)\] max-w-80/, "mobile sidebar must keep a usable width");
  assert.match(sidebar, /md:w-\[4\.5rem\]/, "desktop collapsed width must be desktop-scoped");
  assert.match(sidebar, /md:w-\[16rem\]/, "desktop expanded width must be desktop-scoped");
  assert.match(sidebar, /setMainView\("chat"\);[\s\S]*setActiveSession\(sessionId\);[\s\S]*setSidebarOpen\(false\);/);
  assert.match(sidebar, /setMainView\("memory-editor"\);[\s\S]*setSidebarOpen\(false\);/);
  assert.match(sidebar, /setMainView\("marketplace"\);[\s\S]*setSidebarOpen\(false\);/);
});

test("standalone route chrome and project workspace avoid fixed desktop columns on mobile", async () => {
  const [frame, switcher, projects, gallery] = await Promise.all([
    readText("apps/web/src/components/AppRouteFrame.tsx"),
    readText("apps/web/src/components/WorkspaceSwitcher.tsx"),
    readText("apps/web/src/components/ProjectsManager.tsx"),
    readText("apps/web/src/components/ArtifactGallerySidebar.tsx"),
  ]);

  assert.match(frame, /hidden min-w-0 sm:block/, "workspace switcher must not squeeze route nav on phones");
  assert.match(switcher, /w-\[calc\(100vw-1rem\)\] max-w-80/, "workspace menu must fit the viewport");
  assert.match(projects, /flex h-full min-h-0 flex-col overflow-hidden/, "projects must stack on mobile");
  assert.match(projects, /lg:flex-row/, "projects may restore columns on large screens");
  assert.match(projects, /max-h-72 w-full[\s\S]*lg:w-72/, "project list must become full-width on mobile");
  assert.match(projects, /max-h-80 w-full[\s\S]*lg:w-80/, "notebook panel must become full-width on mobile");
  assert.match(
    gallery,
    /fixed inset-y-0 right-0 z-50[\s\S]*md:static/,
    "artifact gallery must become a mobile overlay",
  );
});
