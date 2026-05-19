import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from "crypto";
import { db } from "./db";
import { agentCredentials, credentialAuditLog, trustPolicies } from "./db/schema";
import { and, desc, eq } from "drizzle-orm";

const ALGORITHM = "aes-256-gcm";
export const TRUST_VAULT_BOUNDARY = process.env.AGENTHUB_TRUST_VAULT_MODE || "process-local-vault";
export const AUDIT_GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
// Fixed salt — intentionally constant for cross-restart consistency (not a secret)
const KDF_SALT = Buffer.from("trust-engine-salt-do-not-change", "utf8");
const KDF_ITERATIONS = 100_000;
type CredentialAuditInsert = typeof credentialAuditLog.$inferInsert;
type CredentialAuditInput = Omit<CredentialAuditInsert, "id" | "createdAt" | "previousHash" | "entryHash">;

function getDerivedKey(): Buffer {
  const secret = process.env.TRUST_ENGINE_SECRET;
  if (!secret) {
    throw new Error(
      "TRUST_ENGINE_SECRET environment variable is not set. " + "Generate one with: openssl rand -base64 32",
    );
  }
  return pbkdf2Sync(secret, KDF_SALT, KDF_ITERATIONS, 32, "sha256");
}

export function encrypt(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
  const key = getDerivedKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(encryptedValue: string, iv: string, authTag: string): string {
  const key = getDerivedKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

// Non-reversible fingerprint — last 8 hex chars of SHA-256, never exposes plaintext
export function keyHint(rawValue: string): string {
  return createHash("sha256").update(rawValue).digest("hex").slice(-8);
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeCredentialAuditHash(previousHash: string | null | undefined, entry: Record<string, unknown>) {
  return createHash("sha256")
    .update(`${previousHash || AUDIT_GENESIS_HASH}:${canonicalize(entry)}`)
    .digest("hex");
}

export async function appendCredentialAuditLog(values: CredentialAuditInput) {
  const createdAt = new Date();
  const [latest] = await db
    .select({ entryHash: credentialAuditLog.entryHash })
    .from(credentialAuditLog)
    .where(eq(credentialAuditLog.userId, values.userId))
    .orderBy(desc(credentialAuditLog.createdAt))
    .limit(1);
  const previousHash = latest?.entryHash || AUDIT_GENESIS_HASH;
  const hashPayload = {
    ...values,
    createdAt: createdAt.toISOString(),
  };
  const entryHash = computeCredentialAuditHash(previousHash, hashPayload);

  await db.insert(credentialAuditLog).values({
    ...values,
    previousHash,
    entryHash,
    createdAt,
  });

  return { previousHash, entryHash };
}

interface ResolveOptions {
  userId: string;
  agentId: string | null;
  tool: string;
}

export async function resolveCredential(opts: ResolveOptions): Promise<string | null> {
  const { userId, agentId, tool } = opts;
  if (!(await enforceSecretUsePolicy(opts))) return null;

  // Agent-scoped credential takes priority over user-scoped
  const conditions = agentId
    ? [
        and(
          eq(agentCredentials.userId, userId),
          eq(agentCredentials.agentId, agentId),
          eq(agentCredentials.tool, tool),
        ),
        and(eq(agentCredentials.userId, userId), eq(agentCredentials.tool, tool)),
      ]
    : [and(eq(agentCredentials.userId, userId), eq(agentCredentials.tool, tool))];

  for (const condition of conditions) {
    const [cred] = await db.select().from(agentCredentials).where(condition).limit(1);
    if (!cred) continue;

    const outcome: "success" | "denied" | "error" = "success";
    await appendCredentialAuditLog({
      userId,
      agentId: agentId ?? undefined,
      credentialId: cred.id,
      tool,
      keyHint: cred.keyHint ?? undefined,
      outcome,
      detail: null,
    });

    try {
      return decrypt(cred.encryptedValue, cred.iv, cred.authTag);
    } catch (err) {
      const errorType = err instanceof Error ? err.message : "Unknown error";
      await appendCredentialAuditLog({
        userId,
        agentId: agentId ?? undefined,
        credentialId: cred.id,
        tool,
        keyHint: cred.keyHint ?? undefined,
        outcome: "error",
        detail: `Decryption failed: ${errorType}`,
      });
      return null;
    }
  }

  return null;
}

export async function auditDenied(opts: ResolveOptions & { detail?: string }) {
  await appendCredentialAuditLog({
    userId: opts.userId,
    agentId: opts.agentId ?? undefined,
    credentialId: undefined,
    tool: opts.tool,
    keyHint: undefined,
    outcome: "denied",
    detail: opts.detail ?? null,
  });
}

function uniqueStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim()),
        ),
      ]
    : [];
}

export async function enforceSecretUsePolicy(opts: ResolveOptions) {
  if (!opts.agentId) return true;
  const [policy] = await db
    .select({ allowedTools: trustPolicies.allowedTools })
    .from(trustPolicies)
    .where(and(eq(trustPolicies.userId, opts.userId), eq(trustPolicies.agentId, opts.agentId)))
    .limit(1);

  const allowedTools = uniqueStringArray(policy?.allowedTools);
  if (allowedTools.length === 0 || allowedTools.includes(opts.tool)) return true;

  await auditDenied({
    ...opts,
    detail: `Trust policy denied credential use for tool: ${opts.tool}`,
  });
  return false;
}
