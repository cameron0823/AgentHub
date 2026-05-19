import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

test("P43.4 i18n package scripts expose check and update automation", async () => {
  const [pkg, checkScript, updateScript] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("scripts/i18n-check.ts"),
    readText("scripts/i18n-update.ts"),
  ]);

  assert.match(pkg.scripts["i18n:check"], /i18n-check\.ts/);
  assert.match(pkg.scripts["i18n:update"], /i18n-update\.ts/);
  assert.ok(pkg.devDependencies.tsx, "web package must run TypeScript i18n scripts");
  assert.match(checkScript, /flattenMessageKeys/, "check script must compare nested keys");
  assert.match(checkScript, /findMissingTranslationKeys/, "check script must report missing keys");
  assert.match(checkScript, /messageNamespaces/, "check script must validate known namespaces");
  assert.match(updateScript, /--write/, "update script must require explicit write mode");
  assert.match(updateScript, /dryRun: true/, "update script must default to reviewed dry-run output");
  assert.match(updateScript, /fillMissingTranslationKeys/, "update script must fill missing keys from base locale");
});

test("P43.4 locale config supports namespaces, browser fallback, and RTL direction", async () => {
  const [config, namespaces, request, layout, arMessages, switcher] = await Promise.all([
    readText("apps/web/src/i18n/config.ts"),
    readText("apps/web/src/i18n/namespaces.ts"),
    readText("apps/web/src/i18n/request.ts"),
    readText("apps/web/src/app/layout.tsx"),
    readJson("apps/web/messages/ar.json"),
    readText("apps/web/src/components/LocaleSwitcher.tsx"),
  ]);

  assert.match(config, /"ar"/, "Arabic must be registered as an RTL sample locale");
  assert.match(config, /getLocaleDirection/);
  assert.match(config, /resolveRequestLocale/);
  assert.match(config, /resolveLocaleFromAcceptLanguage/);
  assert.match(namespaces, /messageNamespaces/);
  assert.match(namespaces, /loadMessages/);
  assert.match(
    namespaces,
    /import\(`\.\.\/\.\.\/messages\/\$\{locale\}\.json`\)/,
    "messages must load through a dynamic locale bundle",
  );
  assert.match(request, /headers\(\)/, "request config must inspect Accept-Language when no cookie exists");
  assert.match(request, /resolveRequestLocale/);
  assert.match(layout, /dir=\{getLocaleDirection\(locale as Locale\)\}/, "root html must set locale direction");
  assert.match(switcher, /localeLabels/);
  assert.match(switcher, /getLocaleDirection/);
  assert.equal(arMessages.settings.language.length > 0, true);
});

test("P43.4 browser spec covers language switch and RTL shell direction", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/i18n.spec.ts");

  assert.match(spec, /Select language/);
  assert.match(spec, /selectOption\("ar"\)/);
  assert.match(spec, /dir/);
  assert.match(spec, /rtl/);
  assert.match(spec, /lang/);
});
