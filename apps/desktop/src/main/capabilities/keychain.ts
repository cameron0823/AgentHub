import { safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SecretRecord = {
  encrypted: string;
  updatedAt: string;
};

type SecretStore = Record<string, SecretRecord>;

const ALLOWED_KEY_PREFIXES = ["agenthub:providerCredential:", "agenthub:mcpServer:"] as const;
const STORE_FILE = "keychain-secrets.json";

function redact(error: unknown) {
  return error instanceof Error ? error.message.replace(/["'`].*["'`]/g, "[redacted]") : "Keychain operation failed";
}

function normalizeSecretKey(key: string) {
  const namespaced = key.startsWith("agenthub:") ? key : `agenthub:${key}`;
  if (!ALLOWED_KEY_PREFIXES.some((prefix) => namespaced.startsWith(prefix))) {
    throw new Error("Keychain key is not allowlisted");
  }
  return namespaced;
}

async function readStore(userDataPath: string): Promise<SecretStore> {
  try {
    return JSON.parse(await readFile(path.join(userDataPath, STORE_FILE), "utf8")) as SecretStore;
  } catch {
    return {};
  }
}

async function writeStore(userDataPath: string, store: SecretStore) {
  await mkdir(userDataPath, { recursive: true });
  await writeFile(path.join(userDataPath, STORE_FILE), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function keychainSet(userDataPath: string, key: string, value: string) {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false as const, error: "Desktop keychain encryption is not available" };
    }

    const normalizedKey = normalizeSecretKey(key);
    const store = await readStore(userDataPath);
    store[normalizedKey] = {
      encrypted: safeStorage.encryptString(value).toString("base64"),
      updatedAt: new Date().toISOString(),
    };
    await writeStore(userDataPath, store);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: redact(error) };
  }
}

export async function keychainGet(userDataPath: string, key: string) {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false as const, error: "Desktop keychain encryption is not available" };
    }

    const normalizedKey = normalizeSecretKey(key);
    const store = await readStore(userDataPath);
    const record = store[normalizedKey];
    if (!record) {
      return { ok: true as const, value: null };
    }

    const value = safeStorage.decryptString(Buffer.from(record.encrypted, "base64"));
    return { ok: true as const, value };
  } catch (error) {
    return { ok: false as const, error: redact(error) };
  }
}
