import { validateProviderBaseUrl } from "./security/outbound";

export type VectorBackendKind = "postgres" | "qdrant" | "milvus";

export interface VectorChunkRecord {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface VectorBackendSearchResult {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
  sourceName?: string;
  sourceType?: string;
  mimeType?: string;
  sourceUrl?: string;
  citation?: string;
  metadata?: Record<string, unknown>;
}

export type VectorBackendConfig =
  | { kind: "postgres" }
  | { kind: "qdrant"; url: string; apiKey?: string; collection: string }
  | { kind: "milvus"; url: string; token?: string; collection: string; dbName?: string };

interface SearchOptions {
  queryVector: number[];
  knowledgeBaseId?: string;
  limit: number;
}

function jsonHeaders(extra?: Record<string, string>) {
  return { "Content-Type": "application/json", ...(extra ?? {}) };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function resolveVectorBackendConfig(env: NodeJS.ProcessEnv = process.env): VectorBackendConfig {
  const kind = (env.AGENTHUB_VECTOR_BACKEND || "postgres").toLowerCase();
  if (kind === "qdrant") {
    return {
      kind: "qdrant",
      url: validateProviderBaseUrl(env.QDRANT_URL, "http://localhost:6333"),
      apiKey: env.QDRANT_API_KEY,
      collection: env.QDRANT_COLLECTION || "agenthub_kb_chunks",
    };
  }
  if (kind === "milvus") {
    return {
      kind: "milvus",
      url: validateProviderBaseUrl(env.MILVUS_URL, "http://localhost:19530"),
      token: env.MILVUS_TOKEN,
      collection: env.MILVUS_COLLECTION || "agenthub_kb_chunks",
      dbName: env.MILVUS_DB,
    };
  }
  return { kind: "postgres" };
}

export async function indexVectorChunks(config: VectorBackendConfig, chunks: VectorChunkRecord[]) {
  if (config.kind === "postgres" || chunks.length === 0) return { indexed: chunks.length, backend: config.kind };
  if (config.kind === "qdrant") return indexQdrantChunks(config, chunks);
  return indexMilvusChunks(config, chunks);
}

async function indexQdrantChunks(
  config: Extract<VectorBackendConfig, { kind: "qdrant" }>,
  chunks: VectorChunkRecord[],
) {
  const headers = jsonHeaders(config.apiKey ? { "api-key": config.apiKey } : undefined);
  const res = await fetch(`${config.url}/collections/${encodeURIComponent(config.collection)}/points?wait=true`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      points: chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.embedding,
        payload: {
          documentId: chunk.documentId,
          content: chunk.content,
          ...chunk.metadata,
        },
      })),
    }),
  });
  if (!res.ok) throw new Error(`Qdrant indexing failed: ${await res.text()}`);
  return { indexed: chunks.length, backend: config.kind };
}

async function indexMilvusChunks(
  config: Extract<VectorBackendConfig, { kind: "milvus" }>,
  chunks: VectorChunkRecord[],
) {
  const headers = jsonHeaders(config.token ? { Authorization: `Bearer ${config.token}` } : undefined);
  const res = await fetch(`${config.url}/v1/vector/insert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...(config.dbName && { dbName: config.dbName }),
      collectionName: config.collection,
      data: chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.embedding,
        documentId: chunk.documentId,
        content: chunk.content,
        ...chunk.metadata,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Milvus indexing failed: ${await res.text()}`);
  return { indexed: chunks.length, backend: config.kind };
}

export async function searchVectorBackend(
  config: VectorBackendConfig,
  options: SearchOptions,
): Promise<VectorBackendSearchResult[]> {
  if (config.kind === "postgres") return [];
  if (config.kind === "qdrant") return searchQdrant(config, options);
  return searchMilvus(config, options);
}

function mapPayloadResult(
  id: unknown,
  score: unknown,
  payload: Record<string, unknown> | undefined,
): VectorBackendSearchResult | null {
  const documentId = asString(payload?.documentId);
  const content = asString(payload?.content);
  if (!documentId || !content) return null;
  return {
    id: String(id),
    documentId,
    content,
    similarity: typeof score === "number" ? score : 0,
    sourceName: asString(payload?.sourceName),
    sourceType: asString(payload?.sourceType),
    mimeType: asString(payload?.mimeType),
    sourceUrl: asString(payload?.sourceUrl),
    citation: asString(payload?.citation),
    metadata: payload,
  };
}

async function searchQdrant(config: Extract<VectorBackendConfig, { kind: "qdrant" }>, options: SearchOptions) {
  const headers = jsonHeaders(config.apiKey ? { "api-key": config.apiKey } : undefined);
  const res = await fetch(`${config.url}/collections/${encodeURIComponent(config.collection)}/points/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      vector: options.queryVector,
      limit: options.limit,
      with_payload: true,
      ...(options.knowledgeBaseId && {
        filter: {
          must: [{ key: "knowledgeBaseId", match: { value: options.knowledgeBaseId } }],
        },
      }),
    }),
  });
  if (!res.ok) throw new Error(`Qdrant search failed: ${await res.text()}`);
  const data = (await res.json()) as {
    result?: Array<{ id: unknown; score?: number; payload?: Record<string, unknown> }>;
  };
  return (data.result ?? [])
    .map((item) => mapPayloadResult(item.id, item.score, item.payload))
    .filter((item): item is VectorBackendSearchResult => Boolean(item));
}

async function searchMilvus(config: Extract<VectorBackendConfig, { kind: "milvus" }>, options: SearchOptions) {
  const headers = jsonHeaders(config.token ? { Authorization: `Bearer ${config.token}` } : undefined);
  const res = await fetch(`${config.url}/v1/vector/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...(config.dbName && { dbName: config.dbName }),
      collectionName: config.collection,
      data: [options.queryVector],
      annsField: "vector",
      limit: options.limit,
      outputFields: [
        "documentId",
        "content",
        "sourceName",
        "sourceType",
        "mimeType",
        "sourceUrl",
        "citation",
        "knowledgeBaseId",
        "index",
      ],
      ...(options.knowledgeBaseId && { filter: `knowledgeBaseId == "${options.knowledgeBaseId}"` }),
    }),
  });
  if (!res.ok) throw new Error(`Milvus search failed: ${await res.text()}`);
  const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? [])
    .map((item) => mapPayloadResult(item.id, item.distance ?? item.score, item))
    .filter((item): item is VectorBackendSearchResult => Boolean(item));
}
