import type { NextRequest } from "next/server";

export type RateLimitTier = "default" | "auth" | "ai" | "sensitive";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  backend: "memory" | "upstash";
};

export const RATE_LIMIT_TIERS: Record<RateLimitTier, { limit: number; windowMs: number }> = {
  default: { limit: 100, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  ai: { limit: 50, windowMs: 60 * 60_000 },
  sensitive: { limit: 5, windowMs: 60_000 },
};

const buckets = new Map<string, number[]>();
const RATE_LIMIT_PREFIX = process.env.RATE_LIMIT_REDIS_PREFIX || "agenthub:rate-limit";

const slidingWindowScript = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
local limit = tonumber(ARGV[3])
local window = tonumber(ARGV[4])
local resetAt = tonumber(ARGV[1]) + window
if count >= limit then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  if oldest[2] then
    resetAt = tonumber(oldest[2]) + window
  end
  return {0, limit, 0, resetAt}
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[5])
redis.call("PEXPIRE", KEYS[1], window)
return {1, limit, limit - count - 1, resetAt}
`.trim();

type UpstashResponse = {
  result?: unknown;
  error?: string;
};

export function classifyRateLimitTier(pathname: string): RateLimitTier {
  if (pathname.startsWith("/api/auth")) return "auth";
  if (
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/groups/stream") ||
    pathname.startsWith("/api/v1/chat")
  )
    return "ai";
  if (pathname.startsWith("/api/upload") || pathname.startsWith("/api/csp-report")) return "sensitive";
  return "default";
}

export function rateLimitIdentifier(request: NextRequest, tier: RateLimitTier) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `${tier}:${forwarded || realIp || "local"}`;
}

function checkMemoryRateLimit(identifier: string, tier: RateLimitTier, now = Date.now()): RateLimitResult {
  const config = RATE_LIMIT_TIERS[tier];
  const windowStart = now - config.windowMs;
  const current = (buckets.get(identifier) ?? []).filter((timestamp) => timestamp > windowStart);
  if (current.length >= config.limit) {
    const oldest = current[0] ?? now;
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt: oldest + config.windowMs,
      backend: "memory",
    };
  }
  current.push(now);
  buckets.set(identifier, current);
  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - current.length),
    resetAt: now + config.windowMs,
    backend: "memory",
  };
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function normalizeRedisNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function checkUpstashRateLimit(
  identifier: string,
  tier: RateLimitTier,
  now: number,
): Promise<RateLimitResult | null> {
  const config = upstashConfig();
  if (!config) return null;

  const tierConfig = RATE_LIMIT_TIERS[tier];
  const key = `${RATE_LIMIT_PREFIX}:${identifier}`;
  const member = `${now}:${crypto.randomUUID()}`;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "EVAL",
      slidingWindowScript,
      "1",
      key,
      String(now),
      String(now - tierConfig.windowMs),
      String(tierConfig.limit),
      String(tierConfig.windowMs),
      member,
    ]),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as UpstashResponse;
  if (payload.error || !Array.isArray(payload.result)) return null;

  const [allowed, limit, remaining, resetAt] = payload.result;
  return {
    allowed: normalizeRedisNumber(allowed, 0) === 1,
    limit: normalizeRedisNumber(limit, tierConfig.limit),
    remaining: normalizeRedisNumber(remaining, 0),
    resetAt: normalizeRedisNumber(resetAt, now + tierConfig.windowMs),
    backend: "upstash",
  };
}

export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier,
  now = Date.now(),
): Promise<RateLimitResult> {
  try {
    const distributed = await checkUpstashRateLimit(identifier, tier, now);
    if (distributed) return distributed;
  } catch {
    // Local and desktop development should stay usable if managed Redis is not configured or temporarily unavailable.
  }
  return checkMemoryRateLimit(identifier, tier, now);
}
