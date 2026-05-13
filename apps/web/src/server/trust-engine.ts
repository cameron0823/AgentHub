import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { db } from "./db";
import { agentCredentials, credentialAuditLog } from "./db/schema";
import { and, eq } from "drizzle-orm";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // bytes

function getDerivedKey(): Buffer {
  const secret = process.env.TRUST_ENGINE_SECRET ?? process.env.NEXTAUTH_SECRET ?? "insecure-dev-only-key";
  return createHash("sha256").update(secret).digest();
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
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function keyHint(rawValue: string): string {
  return rawValue.slice(0, 4) + "****";
}

interface ResolveOptions {
  userId: string;
  agentId: string | null;
  tool: string;
}

export async function resolveCredential(opts: ResolveOptions): Promise<string | null> {
  const { userId, agentId, tool } = opts;

  // Agent-scoped credential takes priority over user-scoped
  const conditions = agentId
    ? [
        and(eq(agentCredentials.userId, userId), eq(agentCredentials.agentId, agentId), eq(agentCredentials.tool, tool)),
        and(eq(agentCredentials.userId, userId), eq(agentCredentials.tool, tool)),
      ]
    : [and(eq(agentCredentials.userId, userId), eq(agentCredentials.tool, tool))];

  for (const condition of conditions) {
    const [cred] = await db.select().from(agentCredentials).where(condition).limit(1);
    if (!cred) continue;

    const outcome: "success" | "denied" | "error" = "success";
    await db.insert(credentialAuditLog).values({
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
    } catch {
      await db.insert(credentialAuditLog).values({
        userId,
        agentId: agentId ?? undefined,
        credentialId: cred.id,
        tool,
        keyHint: cred.keyHint ?? undefined,
        outcome: "error",
        detail: "Decryption failed",
      });
      return null;
    }
  }

  return null;
}

export async function auditDenied(opts: ResolveOptions & { detail?: string }) {
  await db.insert(credentialAuditLog).values({
    userId: opts.userId,
    agentId: opts.agentId ?? undefined,
    credentialId: undefined,
    tool: opts.tool,
    keyHint: undefined,
    outcome: "denied",
    detail: opts.detail ?? null,
  });
}
