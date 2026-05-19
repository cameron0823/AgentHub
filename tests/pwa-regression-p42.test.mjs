import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("P42.4 manifest preserves installable PWA metadata", async () => {
  const raw = await readText("apps/web/public/manifest.json");
  const manifest = JSON.parse(raw);

  assert.equal(manifest.name, "AgentHub");
  assert.equal(manifest.short_name, "AgentHub");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/", "manifest must constrain the PWA install scope");
  assert.equal(manifest.orientation, "any", "desktop and mobile installs must support any orientation");
  assert.ok(manifest.description?.includes("Local AI Agent Platform"), "manifest must describe the app");
  assert.ok(manifest.theme_color, "manifest must include theme_color");
  assert.ok(manifest.background_color, "manifest must include background_color");
  assert.ok(Array.isArray(manifest.categories), "manifest must include store categories");
  assert.ok(manifest.categories.includes("productivity"), "manifest should classify AgentHub as productivity software");
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, "manifest must expose app shortcuts");

  const icons = new Map(manifest.icons.map((icon) => [icon.sizes, icon]));
  assert.equal(icons.get("192x192")?.purpose, "any maskable", "192px icon must be maskable");
  assert.equal(icons.get("512x512")?.purpose, "any maskable", "512px icon must be maskable");
});

test("P42.4 service worker pre-caches an offline shell and avoids dynamic APIs", async () => {
  const sw = await readText("apps/web/public/sw.js");

  assert.match(sw, /APP_SHELL_URLS/, "service worker must maintain an explicit app shell list");
  assert.match(sw, /"\/"/, "service worker must pre-cache the app shell route");
  assert.match(sw, /"\/manifest\.json"/, "service worker must pre-cache the manifest");
  assert.match(sw, /cache\.addAll\(APP_SHELL_URLS\)/, "install event must pre-cache the shell");
  assert.match(sw, /self\.skipWaiting\(\)/, "install event must activate new workers promptly");
  assert.match(sw, /clients\.claim\(\)/, "activate event must claim existing clients");
  assert.match(sw, /caches\.delete/, "activate event must clear old caches");
  assert.match(sw, /request\.mode === "navigate"/, "navigation requests must receive offline fallback handling");
  assert.match(sw, /new Response\(/, "offline fallback must return a deterministic HTML response");
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/, "service worker must not cache API routes");
  assert.match(sw, /url\.pathname\.startsWith\("\/trpc\/"\)/, "service worker must not cache tRPC routes");
  assert.match(sw, /request\.method !== "GET"/, "service worker must ignore non-GET requests");
});

test("P42.4 shell registration and responsive layout remain wired", async () => {
  const [layout, registrar, home, css] = await Promise.all([
    readText("apps/web/src/app/layout.tsx"),
    readText("apps/web/src/components/ServiceWorkerRegistrar.tsx"),
    readText("apps/web/src/app/page.tsx"),
    readText("apps/web/src/app/globals.css"),
  ]);

  assert.match(layout, /rel="manifest"/, "root layout must link the manifest");
  assert.match(layout, /theme-color/, "root layout must expose theme-color metadata");
  assert.match(layout, /apple-touch-icon/, "root layout must include an Apple touch icon");
  assert.match(layout, /ServiceWorkerRegistrar/, "root layout must mount the service worker registrar");
  assert.match(registrar, /"serviceWorker" in navigator/, "registrar must feature-detect service workers");
  assert.match(registrar, /getServiceWorkerScriptUrl/, "registrar must register /sw.js through Trusted Types");
  assert.match(registrar, /agenthub-service-worker/, "registrar must use the dedicated Trusted Types policy");

  assert.match(home, /p-2 text-foreground md:p-8/, "home shell must keep compact mobile padding");
  assert.match(home, /max-w-\[1480px\]/, "home shell must cap desktop width");
  assert.match(home, /min-w-0 flex-1/, "main surface must allow mobile flex shrink");
  assert.match(css, /overflow-x: hidden/, "global styles must prevent horizontal overflow");
  assert.match(
    css,
    /\.agenthub-aurora-scene \{[\s\S]*overflow: hidden;/,
    "PWA shell decoration must not widen mobile viewports",
  );
  assert.match(
    css,
    /width: min\(100%, var\(--agenthub-message-max-width\)\)/,
    "chat content must remain viewport constrained",
  );
});
