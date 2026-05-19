import type { Locale } from "./config";

export const messageNamespaces = ["nav", "chat", "agents", "kb", "auth", "common", "settings"] as const;
export type MessageNamespace = (typeof messageNamespaces)[number];
export type LocaleMessages = Record<string, unknown>;

export async function loadMessages(locale: Locale): Promise<LocaleMessages> {
  return (await import(`../../messages/${locale}.json`)).default;
}

export function pickMessagesByNamespace(
  messages: LocaleMessages,
  namespaces: readonly MessageNamespace[] = messageNamespaces,
): LocaleMessages {
  return Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace] ?? {}]));
}

export function listMessageNamespaces(messages: LocaleMessages) {
  return Object.keys(messages).sort();
}
