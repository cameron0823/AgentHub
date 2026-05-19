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

describe("Custom theme system", () => {
  it("theme provider persists versioned theme, accent palette, layout mode, and system sync", async () => {
    const provider = await readText("apps/web/src/components/ThemeProvider.tsx");

    assert.match(provider, /AGENTHUB_THEME_SETTINGS_KEY/);
    assert.match(provider, /type AccentPalette = "blue" \| "cyan" \| "emerald" \| "amber" \| "rose"/);
    assert.match(provider, /type LayoutMode = "chat" \| "document"/);
    assert.match(provider, /setAccentPalette/);
    assert.match(provider, /setLayoutMode/);
    assert.match(provider, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
    assert.match(provider, /addEventListener\("change"/, "system theme must react to OS changes");
    assert.match(provider, /dataset\.agenthubAccent/);
    assert.match(provider, /dataset\.agenthubLayout/);
  });

  it("layout pre-hydration script applies persisted settings before React mounts", async () => {
    const layout = await readText("apps/web/src/app/layout.tsx");

    assert.match(layout, /agenthub-theme-settings/);
    assert.match(layout, /dataset\.agenthubAccent/);
    assert.match(layout, /dataset\.agenthubLayout/);
    assert.match(layout, /suppressHydrationWarning/);
  });

  it("settings page exposes swatches, theme mode, and chat/document layout controls", async () => {
    const [settingsPage, themeSettings] = await Promise.all([
      readText("apps/web/src/app/settings/page.tsx"),
      readText("apps/web/src/components/ThemeSettings.tsx"),
    ]);

    assert.match(settingsPage, /ThemeSettings/);
    assert.match(themeSettings, /data-testid="theme-settings"/);
    assert.match(themeSettings, /Accent palette/);
    assert.match(themeSettings, /data-testid="accent-swatch-emerald"/);
    assert.match(themeSettings, /System/);
    assert.match(themeSettings, /Document/);
    assert.match(themeSettings, /Chat/);
  });

  it("global CSS defines accent palettes and document layout tokens", async () => {
    const css = await readText("apps/web/src/app/globals.css");

    for (const palette of ["blue", "cyan", "emerald", "amber", "rose"]) {
      assert.match(css, new RegExp(`data-agenthub-accent="${palette}"`));
    }
    assert.match(css, /data-agenthub-layout="document"/);
    assert.match(css, /--agenthub-message-max-width/);
    assert.match(css, /agenthub-chat-list/);
  });

  it("chat surfaces consume layout mode through stable layout classes", async () => {
    const [chatInterface, virtualized] = await Promise.all([
      readText("apps/web/src/components/ChatInterface.tsx"),
      readText("apps/web/src/components/VirtualizedMessageList.tsx"),
    ]);

    assert.match(chatInterface, /agenthub-chat-shell/);
    assert.match(virtualized, /agenthub-chat-list/);
  });

  it("browser spec covers persisted custom theme settings", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-g/theme.spec.ts");

    assert.match(spec, /Accent palette/);
    assert.match(spec, /Document/);
    assert.match(spec, /agenthub-theme-settings/);
    assert.match(spec, /data-agenthub-accent/);
    assert.match(spec, /data-agenthub-layout/);
  });
});
