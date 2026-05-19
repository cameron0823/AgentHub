import { z } from "zod";
import { fetchWithOutboundGuard } from "../security/outbound";
import { summarizeMarketplaceManifest, type MarketplaceManifest } from "./manifest";

export const COMMUNITY_MARKETPLACE_PUBLISH_TIMEOUT_MS = 7000;

const communityPublishResponseSchema = z
  .object({
    status: z.enum(["queued", "published", "rejected"]).default("queued"),
    submissionId: z.string().trim().min(1).optional(),
    shareUrl: z.string().trim().url().optional(),
    message: z.string().trim().min(1).optional(),
  })
  .passthrough();

export function buildCommunityIndexItem(manifest: MarketplaceManifest) {
  return {
    manifest,
    summary: summarizeMarketplaceManifest(manifest),
  };
}

async function readPublishResponse(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function publishCommunityManifest(manifest: MarketplaceManifest, submit: boolean) {
  const indexItem = buildCommunityIndexItem(manifest);
  const publishUrl = process.env.AGENTHUB_AGENT_PUBLISH_URL;

  if (!submit || !publishUrl) {
    return {
      status: "draft" as const,
      message: publishUrl
        ? "Community publish draft generated. Submit when ready."
        : "AGENTHUB_AGENT_PUBLISH_URL is not configured; publish draft generated for manual community submission.",
      manifest,
      indexItem,
    };
  }

  try {
    const res = await fetchWithOutboundGuard(
      publishUrl,
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(indexItem),
        signal: AbortSignal.timeout(COMMUNITY_MARKETPLACE_PUBLISH_TIMEOUT_MS),
      },
      { purpose: "Community marketplace publish" },
    );

    if (!res.ok) {
      return {
        status: "error" as const,
        message: `Community marketplace publish returned ${res.status}.`,
        manifest,
        indexItem,
      };
    }

    const response = communityPublishResponseSchema.parse(await readPublishResponse(res));
    return {
      ...response,
      manifest,
      indexItem,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Community marketplace publish failed.",
      manifest,
      indexItem,
    };
  }
}
