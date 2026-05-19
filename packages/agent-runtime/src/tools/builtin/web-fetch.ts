import { z } from "zod";
import { ToolDefinition } from "../registry";

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0"]);
const MAX_FETCH_BYTES = 128 * 1024;

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  );
}

export function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    PRIVATE_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    isPrivateIPv4(normalized)
  );
}

export function validatePublicHttpUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("web_fetch only supports http and https URLs");
  }
  if (isPrivateHostname(parsed.hostname) && process.env.AGENTHUB_WEB_FETCH_ALLOW_PRIVATE !== "true") {
    throw new Error("web_fetch blocked a private or local network target");
  }
  parsed.username = "";
  parsed.password = "";
  return parsed;
}

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description: "Fetch a public HTTP(S) URL through AgentHub's outbound request guard and return bounded text content.",
  parameters: z.object({
    url: z.string().url().describe("Public http or https URL to fetch."),
    maxBytes: z.number().int().min(1).max(MAX_FETCH_BYTES).optional().describe("Maximum response bytes to return."),
  }),
  execute: async ({ url, maxBytes }) => {
    const parsed = validatePublicHttpUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(parsed, {
        headers: {
          Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1",
          "User-Agent": "AgentHub web_fetch",
        },
        signal: controller.signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const limit = Math.min(maxBytes ?? MAX_FETCH_BYTES, MAX_FETCH_BYTES);
      return {
        url: parsed.toString(),
        status: res.status,
        ok: res.ok,
        contentType,
        bytes: Buffer.byteLength(text, "utf8"),
        content: text.slice(0, limit),
        truncated: Buffer.byteLength(text, "utf8") > limit,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
