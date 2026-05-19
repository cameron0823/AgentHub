export const CHANNEL_PROVIDERS = ["discord", "slack"] as const;
export const CHANNEL_DM_POLICIES = ["disabled", "paired-only", "open"] as const;

export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];
export type ChannelDmPolicy = (typeof CHANNEL_DM_POLICIES)[number];

export interface NormalizedChannelCommand {
  provider: ChannelProvider;
  command: string;
  text: string;
  externalSenderId: string;
  externalChannelId?: string;
  externalTeamId?: string;
  senderDisplayName?: string;
  responseUrl?: string;
  isDirectMessage: boolean;
  isPing?: boolean;
  raw: Record<string, unknown>;
}

export interface ChannelPolicyAccount {
  dmPolicy: ChannelDmPolicy;
  allowedTools: unknown;
}

export interface ChannelPolicySender {
  isPaired: boolean;
  allowedTools: unknown;
}

export interface ChannelPolicyDecision {
  allowed: boolean;
  reason?: string;
}

export function parseChannelCommand(text: string): { command: string; args: string } {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return { command: "message", args: "" };

  const [firstToken = "", ...rest] = normalized.split(" ");
  const command = firstToken.replace(/^\/+/, "").toLowerCase();
  return {
    command: command || "message",
    args: rest.join(" ").trim(),
  };
}

export function parseChannelToolList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
  } catch {
    // Fall back to a simple operator-entered comma/newline list.
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function evaluateChannelSenderPolicy(
  account: ChannelPolicyAccount,
  senderPolicy: ChannelPolicySender | null | undefined,
  command: Pick<NormalizedChannelCommand, "isDirectMessage">,
): ChannelPolicyDecision {
  if (!command.isDirectMessage) return { allowed: true };

  if (account.dmPolicy === "disabled") {
    return { allowed: false, reason: "direct_messages_disabled" };
  }

  if (account.dmPolicy === "paired-only" && !senderPolicy?.isPaired) {
    return { allowed: false, reason: "sender_not_paired" };
  }

  return { allowed: true };
}

export function resolveChannelToolIds(accountAllowedTools: unknown, senderAllowedTools: unknown): string[] {
  const accountAllowedToolsList = parseChannelToolList(accountAllowedTools);
  if (accountAllowedToolsList.length === 0) return [];

  const senderTools = parseChannelToolList(senderAllowedTools);
  if (senderTools.length === 0) return accountAllowedToolsList;

  const accountToolSet = new Set(accountAllowedToolsList);
  return senderTools.filter((tool) => accountToolSet.has(tool));
}
