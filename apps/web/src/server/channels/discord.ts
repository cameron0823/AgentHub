import { createPublicKey, verify as cryptoVerify } from "crypto";
import { parseChannelCommand, type NormalizedChannelCommand } from "./types";

export const DISCORD_PUBLIC_KEY_DER_PREFIX = "302a300506032b6570032100";
export const DISCORD_SIGNATURE_ALGORITHM = "ed25519";

interface DiscordSignatureInput {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  publicKey: string;
}

function toDiscordPublicKey(publicKey: string) {
  const trimmed = publicKey.trim();
  if (trimmed.startsWith("-----BEGIN")) return createPublicKey(trimmed);

  const publicKeyBytes = Buffer.from(trimmed, "hex");
  if (publicKeyBytes.length !== 32) {
    throw new Error("Discord public key must be a 32-byte Ed25519 hex string or PEM public key");
  }

  return createPublicKey({
    key: Buffer.concat([Buffer.from(DISCORD_PUBLIC_KEY_DER_PREFIX, "hex"), publicKeyBytes]),
    format: "der",
    type: "spki",
  });
}

export function verifyDiscordSignature(input: DiscordSignatureInput): boolean {
  const { rawBody, timestamp, signature, publicKey } = input;
  if (!timestamp || !signature || !publicKey) return false;

  try {
    return cryptoVerify(
      null,
      Buffer.concat([Buffer.from(timestamp), Buffer.from(rawBody)]),
      toDiscordPublicKey(publicKey),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

function optionValue(option: unknown): string | null {
  if (!option || typeof option !== "object") return null;
  const value = (option as { value?: unknown }).value;
  if (value === undefined || value === null) return null;
  return String(value);
}

export function parseDiscordInteraction(rawBody: string): NormalizedChannelCommand {
  const payload = JSON.parse(rawBody) as {
    type?: number;
    data?: { name?: string; options?: unknown[] };
    guild_id?: string | null;
    channel_id?: string;
    member?: { user?: { id?: string; username?: string; global_name?: string } };
    user?: { id?: string; username?: string; global_name?: string };
  };

  if (payload.type === 1) {
    return {
      provider: "discord",
      command: "ping",
      text: "",
      externalSenderId: "discord",
      externalChannelId: payload.channel_id,
      externalTeamId: payload.guild_id || undefined,
      isDirectMessage: false,
      isPing: true,
      raw: payload as Record<string, unknown>,
    };
  }

  const user = payload.member?.user ?? payload.user ?? {};
  const commandName = payload.data?.name || "agenthub";
  const args = (payload.data?.options || [])
    .map(optionValue)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const parsed = parseChannelCommand(`/${commandName} ${args}`);

  return {
    provider: "discord",
    command: parsed.command,
    text: parsed.args || args,
    externalSenderId: user.id || "",
    externalChannelId: payload.channel_id,
    externalTeamId: payload.guild_id || undefined,
    senderDisplayName: user.global_name || user.username,
    isDirectMessage: !payload.guild_id,
    raw: payload as Record<string, unknown>,
  };
}
