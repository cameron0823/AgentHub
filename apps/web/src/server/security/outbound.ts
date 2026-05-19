export interface OutboundUrlOptions {
  allowedOrigins?: string[];
  allowPrivateNetwork?: boolean;
  envAllowPrivateFlag?: string;
  fallbackUrl?: string;
  purpose?: string;
}

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "0.0.0.0"]);
const PRIVATE_HOST_PREFIXES = ["127.", "10.", "192.168.", "169.254."];
const PRIVATE_HOST_PATTERNS = [
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isFlagEnabled(name?: string) {
  if (!name) return false;
  const value = process.env[name];
  return value === "1" || value === "true";
}

export function normalizeOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  );
}

export function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return (
    PRIVATE_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    PRIVATE_HOST_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    isPrivateIPv4(normalized)
  );
}

export function validateOutboundUrl(raw: string, options: OutboundUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    if (options.fallbackUrl)
      return validateOutboundUrl(options.fallbackUrl, {
        ...options,
        fallbackUrl: undefined,
        allowPrivateNetwork: true,
      });
    throw new Error(`${options.purpose ?? "Outbound"} URL is invalid`);
  }

  // protocol http/https allowlist.
  if (!["http:", "https:"].includes(parsed.protocol)) {
    if (options.fallbackUrl)
      return validateOutboundUrl(options.fallbackUrl, {
        ...options,
        fallbackUrl: undefined,
        allowPrivateNetwork: true,
      });
    throw new Error(`${options.purpose ?? "Outbound"} URL protocol is not allowed`);
  }

  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";

  const allowedOrigins = new Set(
    (options.allowedOrigins ?? [])
      .map((origin) => normalizeOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );
  const isAllowedOrigin = allowedOrigins.has(parsed.origin);
  const allowPrivateNetwork =
    options.allowPrivateNetwork ||
    isAllowedOrigin ||
    isFlagEnabled(options.envAllowPrivateFlag) ||
    isFlagEnabled("AGENTHUB_OUTBOUND_ALLOW_PRIVATE");

  if (isPrivateHostname(parsed.hostname) && !allowPrivateNetwork) {
    throw new Error(`${options.purpose ?? "Outbound"} URL blocked a private or local network target`);
  }

  return parsed;
}

export function validatePublicHttpUrl(raw: string, options: OutboundUrlOptions = {}): URL {
  return validateOutboundUrl(raw, {
    ...options,
    envAllowPrivateFlag: options.envAllowPrivateFlag ?? "AGENTHUB_OUTBOUND_ALLOW_PRIVATE",
  });
}

export function validateProviderBaseUrl(
  raw: string | undefined | null,
  fallbackUrl = "http://localhost:11434",
): string {
  const parsed = validateOutboundUrl(raw || fallbackUrl, {
    allowPrivateNetwork: true,
    fallbackUrl,
    purpose: "Provider base",
  });
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function fetchWithOutboundGuard(
  raw: string,
  init?: RequestInit,
  options: OutboundUrlOptions = {},
): Promise<Response> {
  return fetchWithOutboundGuardInternal(raw, init, options);
}

async function fetchWithOutboundGuardInternal(
  raw: string,
  init?: RequestInit,
  options: OutboundUrlOptions = {},
): Promise<Response> {
  let parsed = validateOutboundUrl(raw, options);

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const res = await fetch(parsed, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) return res;
    parsed = validateOutboundUrl(new URL(location, parsed).toString(), options);
  }

  throw new Error(`${options.purpose ?? "Outbound"} URL exceeded redirect limit`);
}
