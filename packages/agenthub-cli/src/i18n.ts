import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ParsedI18nArgs {
  messagesDir: string;
  baseLocale: string;
  locales: string[];
  dryRun: boolean;
}

export interface MissingTranslationReport {
  locale: string;
  missing: string[];
  extra: string[];
}

type JsonRecord = Record<string, unknown>;

export function parseI18nArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedI18nArgs {
  const parsed: ParsedI18nArgs = {
    messagesDir: env.AGENTHUB_I18N_MESSAGES_DIR ?? "apps/web/messages",
    baseLocale: "en",
    locales: [],
    dryRun: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      return value;
    };

    switch (token) {
      case "--messages-dir":
        parsed.messagesDir = next();
        break;
      case "--base":
        parsed.baseLocale = next();
        break;
      case "--locale":
        parsed.locales.push(next());
        break;
      case "--write":
        parsed.dryRun = false;
        break;
      default:
        throw new Error(`Unknown i18n option: ${token}`);
    }
  }

  return parsed;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function flattenMessageKeys(messages: JsonRecord, prefix = ""): string[] {
  return Object.entries(messages)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return isRecord(value) ? flattenMessageKeys(value, path) : [path];
    })
    .sort();
}

function getAtPath(messages: JsonRecord, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, messages);
}

function setAtPath(messages: JsonRecord, path: string, value: unknown) {
  const segments = path.split(".");
  let current = messages;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as JsonRecord;
  }
  current[segments[segments.length - 1]] = value;
}

async function readMessages(messagesDir: string, locale: string): Promise<JsonRecord> {
  const raw = await readFile(join(messagesDir, `${locale}.json`), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${locale}.json must be a JSON object.`);
  return parsed;
}

async function discoverLocales(messagesDir: string, baseLocale: string) {
  const entries = await readdir(messagesDir);
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/, ""))
    .filter((locale) => locale !== baseLocale)
    .sort();
}

export function findMissingTranslationKeys(
  baseMessages: JsonRecord,
  localeMessages: JsonRecord,
): Omit<MissingTranslationReport, "locale"> {
  const baseKeys = flattenMessageKeys(baseMessages);
  const localeKeys = flattenMessageKeys(localeMessages);
  const localeSet = new Set(localeKeys);
  const baseSet = new Set(baseKeys);

  return {
    missing: baseKeys.filter((key) => !localeSet.has(key)),
    extra: localeKeys.filter((key) => !baseSet.has(key)),
  };
}

export async function runI18nCommand(argv: string[], io: { stdout?: Pick<NodeJS.WriteStream, "write"> } = {}) {
  const stdout = io.stdout ?? process.stdout;
  const parsed = parseI18nArgs(argv);
  const baseMessages = await readMessages(parsed.messagesDir, parsed.baseLocale);
  const locales =
    parsed.locales.length > 0 ? parsed.locales : await discoverLocales(parsed.messagesDir, parsed.baseLocale);
  const reports: MissingTranslationReport[] = [];

  for (const locale of locales) {
    const localeMessages = await readMessages(parsed.messagesDir, locale);
    const report = findMissingTranslationKeys(baseMessages, localeMessages);
    reports.push({ locale, ...report });

    if (!parsed.dryRun && report.missing.length > 0) {
      for (const key of report.missing) {
        setAtPath(localeMessages, key, getAtPath(baseMessages, key));
      }
      await writeFile(join(parsed.messagesDir, `${locale}.json`), `${JSON.stringify(localeMessages, null, 2)}\n`);
    }
  }

  for (const report of reports) {
    stdout.write(`${report.locale}: ${report.missing.length} missing, ${report.extra.length} extra\n`);
    for (const key of report.missing) stdout.write(`  missing ${key}\n`);
    for (const key of report.extra) stdout.write(`  extra ${key}\n`);
  }

  if (parsed.dryRun) stdout.write("Dry run: pass --write to add missing keys from the base locale.\n");
}
