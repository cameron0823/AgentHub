import type { Message } from "@agenthub/ai-providers";
import { isPrivateHostname, normalizeOrigin, validateOutboundUrl } from "./security/outbound";

export interface MediaSafetyOptions {
  allowPrivateNetwork?: boolean;
  trustedOrigins?: string[];
}

export function getTrustedMediaOrigins(): string[] {
  return [process.env.S3_ENDPOINT]
    .filter((value): value is string => Boolean(value))
    .map(normalizeOrigin)
    .filter((value): value is string => Boolean(value));
}

export { isPrivateHostname };

export function validateMediaUrl(raw: string, options: MediaSafetyOptions = {}): string {
  const parsed = validateOutboundUrl(raw, {
    allowedOrigins: [...(options.trustedOrigins ?? []), ...getTrustedMediaOrigins()],
    allowPrivateNetwork: options.allowPrivateNetwork,
    envAllowPrivateFlag: "AGENTHUB_ALLOW_PRIVATE_MEDIA_URLS",
    purpose: "Media",
  });
  return parsed.toString();
}

export function validateMessageMedia(messages: Message[], options: MediaSafetyOptions = {}): Message[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "image_url" ? { ...part, url: validateMediaUrl(part.url, options) } : part,
      ),
    };
  });
}
