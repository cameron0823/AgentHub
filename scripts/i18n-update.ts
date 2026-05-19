import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

type JsonObject = Record<string, unknown>;

interface UpdateOptions {
  messagesDir: string;
  baseLocale: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): UpdateOptions {
  const options: Partial<UpdateOptions> = { dryRun: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--messages") options.messagesDir = argv[++index];
    if (arg === "--base") options.baseLocale = argv[++index];
    if (arg === "--write") options.dryRun = false;
    if (arg === "--dry-run") options.dryRun = true;
  }
  return {
    messagesDir: resolveMessagesDir(options.messagesDir),
    baseLocale: options.baseLocale ?? "en",
    dryRun: options.dryRun ?? true,
  };
}

function resolveMessagesDir(explicit?: string) {
  if (explicit) return path.resolve(process.cwd(), explicit);
  const cwdMessages = path.resolve(process.cwd(), "messages");
  if (existsSync(cwdMessages)) return cwdMessages;
  return path.resolve(process.cwd(), "apps/web/messages");
}

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
}

function clone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).map(([key, child]) => [key, clone(child)]));
  }
  return value;
}

export function fillMissingTranslationKeys(
  base: JsonObject,
  target: JsonObject,
): { next: JsonObject; added: string[] } {
  const next = clone(target) as JsonObject;
  const added: string[] = [];

  function visit(baseNode: JsonObject, targetNode: JsonObject, prefix: string) {
    for (const [key, baseValue] of Object.entries(baseNode)) {
      const pathKey = prefix ? `${prefix}.${key}` : key;
      const targetValue = targetNode[key];
      if (baseValue && typeof baseValue === "object" && !Array.isArray(baseValue)) {
        if (!targetValue || typeof targetValue !== "object" || Array.isArray(targetValue)) {
          targetNode[key] = {};
        }
        visit(baseValue as JsonObject, targetNode[key] as JsonObject, pathKey);
      } else if (!(key in targetNode)) {
        targetNode[key] = baseValue;
        added.push(pathKey);
      }
    }
  }

  visit(base, next, "");
  return { next, added };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = (await readdir(options.messagesDir)).filter((file) => file.endsWith(".json")).sort();
  const baseMessages = await readJson(path.join(options.messagesDir, `${options.baseLocale}.json`));
  let totalAdded = 0;

  for (const file of files) {
    if (file === `${options.baseLocale}.json`) continue;
    const filePath = path.join(options.messagesDir, file);
    const messages = await readJson(filePath);
    const { next, added } = fillMissingTranslationKeys(baseMessages, messages);
    totalAdded += added.length;
    console.log(
      `${path.basename(file, ".json")}: ${added.length === 0 ? "no changes" : `${added.length} missing key(s)`}`,
    );
    for (const key of added) console.log(`  + ${key}`);
    if (!options.dryRun && added.length > 0) {
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
    }
  }

  if (options.dryRun) {
    console.log(`dry-run: true, ${totalAdded} key(s) would be added. Pass --write to update files.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
