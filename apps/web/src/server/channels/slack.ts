import { createHmac, timingSafeEqual } from "crypto";
import { parseChannelCommand, type NormalizedChannelCommand } from "./types";

export const SLACK_SIGNATURE_TOLERANCE_SECONDS = 60 * 5;

interface SlackSignatureInput {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowMs?: number;
}

function safeTimingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySlackSignature(input: SlackSignatureInput): boolean {
  const { rawBody, timestamp, signature, signingSecret, nowMs = Date.now() } = input;
  if (!timestamp || !signature || !signingSecret) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const currentSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(currentSeconds - timestampSeconds) > SLACK_SIGNATURE_TOLERANCE_SECONDS) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;
  return safeTimingEqual(expected, signature);
}

export function parseSlackSlashCommand(rawBody: string): NormalizedChannelCommand {
  const params = new URLSearchParams(rawBody);
  const commandName = params.get("command") || "/agenthub";
  const text = params.get("text")?.trim() || "";
  const parsed = parseChannelCommand(`${commandName} ${text}`);
  const channelId = params.get("channel_id") || undefined;
  const channelName = params.get("channel_name") || "";

  return {
    provider: "slack",
    command: parsed.command,
    text: parsed.args || text,
    externalSenderId: params.get("user_id") || "",
    externalChannelId: channelId,
    externalTeamId: params.get("team_id") || undefined,
    senderDisplayName: params.get("user_name") || undefined,
    responseUrl: params.get("response_url") || undefined,
    isDirectMessage: channelName === "directmessage" || channelId?.startsWith("D") === true,
    raw: Object.fromEntries(params.entries()),
  };
}
