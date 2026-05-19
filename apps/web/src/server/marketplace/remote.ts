import { z } from "zod";
import {
  MARKETPLACE_SCHEMA_VERSION,
  parseMarketplaceManifest,
  summarizeMarketplaceManifest,
  type MarketplaceCatalogItem,
  type MarketplaceManifest,
} from "./manifest";
import { fetchWithOutboundGuard } from "../security/outbound";

export const REMOTE_MARKETPLACE_CACHE_TTL_MS = 5 * 60 * 1000;
export const REMOTE_MARKETPLACE_TIMEOUT_MS = 5000;
export const REMOTE_MARKETPLACE_INDEX_VERSION = "agenthub.marketplace.index.v1" as const;

export const remoteIndexSchema = z
  .object({
    schemaVersion: z.literal(REMOTE_MARKETPLACE_INDEX_VERSION),
    generatedAt: z.string().optional(),
    items: z.array(z.union([z.object({ manifest: z.unknown() }).strict(), z.unknown()])).default([]),
  })
  .strict();

interface RemoteMarketplaceCache {
  indexUrl: string;
  expiresAt: number;
  items: MarketplaceCatalogItem[];
  warnings: string[];
}

let remoteMarketplaceCache: RemoteMarketplaceCache | null = null;

export function offlineFallback(reason: string) {
  return {
    items: [] as MarketplaceCatalogItem[],
    warnings: [reason],
    source: "offline" as const,
  };
}

function manifestFromRemoteItem(item: unknown): MarketplaceManifest {
  if (item && typeof item === "object" && "manifest" in item) {
    return parseMarketplaceManifest((item as { manifest: unknown }).manifest);
  }
  return parseMarketplaceManifest(item);
}

export async function fetchRemoteMarketplaceCatalog(indexUrl = process.env.AGENTHUB_AGENT_INDEX_URL) {
  if (!indexUrl) {
    return offlineFallback("AGENTHUB_AGENT_INDEX_URL is not configured; using bundled local catalog only.");
  }

  const now = Date.now();
  if (remoteMarketplaceCache?.indexUrl === indexUrl && remoteMarketplaceCache.expiresAt > now) {
    return {
      items: remoteMarketplaceCache.items,
      warnings: remoteMarketplaceCache.warnings,
      source: "cache" as const,
    };
  }

  try {
    const res = await fetchWithOutboundGuard(
      indexUrl,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REMOTE_MARKETPLACE_TIMEOUT_MS),
      },
      {
        purpose: "Remote marketplace",
      },
    );
    if (!res.ok) {
      return offlineFallback(`Remote marketplace returned ${res.status}.`);
    }

    const remoteIndex = remoteIndexSchema.parse(await res.json());
    const warnings: string[] = [];
    const items: MarketplaceCatalogItem[] = [];

    for (const item of remoteIndex.items) {
      try {
        const manifest = manifestFromRemoteItem(item);
        if (manifest.schemaVersion !== MARKETPLACE_SCHEMA_VERSION) {
          warnings.push(`Skipped manifest with unsupported schema version: ${manifest.schemaVersion}`);
          continue;
        }
        items.push({
          summary: summarizeMarketplaceManifest(manifest),
          manifest,
          source: "remote",
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Skipped invalid remote marketplace item.");
      }
    }

    remoteMarketplaceCache = {
      indexUrl,
      expiresAt: now + REMOTE_MARKETPLACE_CACHE_TTL_MS,
      items,
      warnings,
    };

    return { items, warnings, source: "remote" as const };
  } catch (error) {
    return offlineFallback(error instanceof Error ? error.message : "Remote marketplace unavailable.");
  }
}

export async function findRemoteCatalogItem(slug: string) {
  const remote = await fetchRemoteMarketplaceCatalog();
  return remote.items.find((item) => item.summary.slug === slug) || null;
}
