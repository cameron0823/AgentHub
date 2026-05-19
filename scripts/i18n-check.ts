import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { messageNamespaces } from "../apps/web/src/i18n/namespaces";

type JsonObject = Record<string, unknown>;

interface CheckOptions {
  messagesDir: string;
  baseLocale: string;
}

function parseArgs(argv: string[]): CheckOptions {
  const options: Partial<CheckOptions> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--messages") options.messagesDir = argv[++index];
    if (arg === "--base") options.baseLocale = argv[++index];
  }
  return {
    messagesDir: resolveMessagesDir(options.messagesDir),
    baseLocale: options.baseLocale ?? "en",
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

export function flattenMessageKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as JsonObject).flatMap(([key, child]) =>
    flattenMessageKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

export function findMissingTranslationKeys(base: JsonObject, target: JsonObject) {
  const targetKeys = new Set(flattenMessageKeys(target));
  return flattenMessageKeys(base).filter((key) => !targetKeys.has(key));
}

function findExtraTranslationKeys(base: JsonObject, target: JsonObject) {
  const baseKeys = new Set(flattenMessageKeys(base));
  return flattenMessageKeys(target).filter((key) => !baseKeys.has(key));
}

function findNamespaceIssues(messages: JsonObject) {
  const namespaceSet = new Set(messageNamespaces);
  const present = Object.keys(messages);
  const missing = messageNamespaces.filter((namespace) => !present.includes(namespace));
  const extra = present.filter((namespace) => !namespaceSet.has(namespace as (typeof messageNamespaces)[number]));
  return { missing, extra };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = (await readdir(options.messagesDir)).filter((file) => file.endsWith(".json")).sort();
  const baseFile = `${options.baseLocale}.json`;
  if (!files.includes(baseFile)) {
    throw new Error(`Base locale file not found: ${path.join(options.messagesDir, baseFile)}`);
  }

  const baseMessages = await readJson(path.join(options.messagesDir, baseFile));
  let issueCount = 0;

  for (const file of files) {
    const locale = path.basename(file, ".json");
    const messages = await readJson(path.join(options.messagesDir, file));
    const missing = findMissingTranslationKeys(baseMessages, messages);
    const extra = findExtraTranslationKeys(baseMessages, messages);
    const namespaceIssues = findNamespaceIssues(messages);
    const total = missing.length + extra.length + namespaceIssues.missing.length + namespaceIssues.extra.length;
    issueCount += total;

    console.log(`${locale}: ${total === 0 ? "ok" : `${total} issue(s)`}`);
    for (const key of missing) console.log(`  missing ${key}`);
    for (const key of extra) console.log(`  extra ${key}`);
    for (const key of namespaceIssues.missing) console.log(`  missing namespace ${key}`);
    for (const key of namespaceIssues.extra) console.log(`  extra namespace ${key}`);
  }

  if (issueCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
