import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("projects route renders persistent navigation back to home", async () => {
  const layout = await readText("apps/web/src/app/layout.tsx");
  const page = await readText("apps/web/src/app/projects/page.tsx");
  const frame = await readText("apps/web/src/components/AppRouteFrame.tsx");

  assert.match(layout, /import \{ AppRouteFrame \}/, "root layout must import the persistent route frame");
  assert.match(
    layout,
    /<AppRouteFrame>\{children\}<\/AppRouteFrame>/,
    "root layout must mount the persistent route frame around app routes",
  );
  assert.match(page, /<ProjectsManager \/>/, "projects route must still render the projects manager");
  assert.match(frame, /data-testid="persistent-route-nav"/, "route frame must expose a persistent nav");
  assert.match(frame, /data-testid="persistent-home-link"/, "route frame must expose a home link");
  assert.match(frame, /href="\/"/, "home nav link must return to the main AgentHub shell");

  for (const route of [
    "/projects",
    "/pages",
    "/kb",
    "/analytics",
    "/automations",
    "/tasks",
    "/review",
    "/settings",
    "/admin",
  ]) {
    assert.match(frame, new RegExp(`"${route}"`), `persistent nav must include ${route}`);
  }
});

test("projects manager fits inside persistent route frame", async () => {
  const manager = await readText("apps/web/src/components/ProjectsManager.tsx");

  assert.match(manager, /data-testid="projects-manager"/);
  assert.match(
    manager,
    /className="flex h-full min-h-0/,
    "projects must fill the framed route content instead of creating a trapped full-screen page",
  );
  assert.doesNotMatch(manager, /className="flex h-screen bg-background text-foreground"/);
});
