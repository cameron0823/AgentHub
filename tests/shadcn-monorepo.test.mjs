import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

test("shadcn monorepo aliases target the shared AgentHub UI package", async () => {
  const [appConfigRaw, packageConfigRaw, pkgRaw, index, button, input, card, utils] = await Promise.all([
    readText("apps/web/components.json"),
    readText("packages/ui/components.json"),
    readText("packages/ui/package.json"),
    readText("packages/ui/src/index.ts"),
    readText("packages/ui/src/components/button.tsx"),
    readText("packages/ui/src/components/input.tsx"),
    readText("packages/ui/src/components/card.tsx"),
    readText("packages/ui/src/lib/utils.ts"),
  ]);
  const appConfig = JSON.parse(appConfigRaw);
  const packageConfig = JSON.parse(packageConfigRaw);
  const pkg = JSON.parse(pkgRaw);

  assert.equal(appConfig.aliases.ui, "@agenthub/ui/components");
  assert.equal(appConfig.aliases.utils, "@agenthub/ui/lib/utils");
  assert.equal(packageConfig.aliases.ui, "@agenthub/ui/components");
  assert.equal(pkg.exports["./components/*"], "./src/components/*.tsx");
  assert.equal(pkg.exports["./lib/*"], "./src/lib/*.ts");
  assert.equal(pkg.exports["./globals.css"], "./src/styles/globals.css");
  assert.match(index, /export \{ Button/);
  assert.match(index, /export \{ Card/);
  assert.match(index, /export \{ Input/);
  assert.match(button, /buttonVariants/);
  assert.match(input, /React\.forwardRef<HTMLInputElement/);
  assert.match(card, /CardHeader/);
  assert.match(utils, /twMerge\(clsx/);
});
