export interface MentionableAgent {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
}

export interface AgentMention {
  id: string;
  name: string;
  raw: string;
  index: number;
}

export interface AgentMentionTrigger {
  start: number;
  query: string;
}

export const AGENT_MENTION_PATTERN = /@\[((?:\\.|[^\]\\]){1,120})\]\(agent:([0-9a-fA-F-]{36})\)/g;

function decodeMentionName(name: string) {
  return name.replace(/\\([\]\\])/g, "$1");
}

function encodeMentionName(name: string) {
  return name.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function formatAgentMentionToken(agent: Pick<MentionableAgent, "id" | "name">) {
  return `@[${encodeMentionName(agent.name)}](agent:${agent.id})`;
}

export function extractAgentMentions(content: string): AgentMention[] {
  const mentions: AgentMention[] = [];
  const seen = new Set<string>();
  AGENT_MENTION_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(AGENT_MENTION_PATTERN)) {
    const id = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    mentions.push({
      id,
      name: decodeMentionName(match[1]),
      raw: match[0],
      index: match.index ?? 0,
    });
  }

  return mentions;
}

export function replaceAgentMentionTokens(content: string) {
  AGENT_MENTION_PATTERN.lastIndex = 0;
  return content.replace(AGENT_MENTION_PATTERN, (_raw, name: string) => `@${decodeMentionName(name)}`);
}

export function findAgentMentionTrigger(value: string, cursor = value.length): AgentMentionTrigger | null {
  const beforeCursor = value.slice(0, cursor);
  const match = /(^|[\s([{])@([A-Za-z0-9 _.-]{0,64})$/.exec(beforeCursor);
  if (!match) return null;
  const start = match.index + match[1].length;
  return { start, query: match[2].trimStart() };
}

export function buildMentionedAgentSystemBlock(mentionedAgents: MentionableAgent[]) {
  if (mentionedAgents.length === 0) return "";

  const lines = [
    "## Inline mentioned-agent context",
    "The user explicitly mentioned the following AgentHub agents in this message.",
    "Use the primary mentioned-agent as the active persona for this turn while preserving the surrounding conversation context.",
    ...mentionedAgents.map((agent, index) => {
      const description = agent.description ? ` - ${agent.description}` : "";
      const model = agent.model ? ` model=${agent.model}` : "";
      return `${index + 1}. ${agent.name} (${agent.id})${model}${description}`;
    }),
  ];

  return lines.join("\n");
}
