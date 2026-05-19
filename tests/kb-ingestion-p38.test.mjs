import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("KB ingestion parser supports planned document, transcript, code, and markdown types", async () => {
  const src = await readText("apps/web/src/server/kb-ingestion.ts");

  assert.match(src, /SUPPORTED_KB_DOCUMENT_KINDS/);
  for (const kind of ["pdf", "docx", "csv", "xlsx", "audio-transcript", "video-transcript", "code", "markdown"]) {
    assert.match(src, new RegExp(`"${kind}"`), `${kind} must be an explicit ingestion kind`);
  }
  for (const exportName of [
    "inferDocumentKind",
    "parseKnowledgeDocument",
    "chunkParsedDocument",
    "createChunkCitation",
  ]) {
    assert.match(src, new RegExp(`export (async )?function ${exportName}`));
  }
  assert.match(src, /readZipTextEntries/, "DOCX/XLSX parsing must read zipped Office XML");
  assert.match(src, /parseTranscript/, "audio/video transcript parsing must normalize VTT/SRT text");
  assert.match(src, /parseVideoKeyframes/, "video keyframe manifests must be handled explicitly");
});

test("KB ingest route uses parser output, finite embeddings, citations, and vector backend indexing", async () => {
  const route = await readText("apps/web/src/app/api/kb/ingest/route.ts");

  assert.match(route, /parseKnowledgeDocument/);
  assert.match(route, /chunkParsedDocument/);
  assert.match(route, /resolveVectorBackendConfig/);
  assert.match(route, /indexVectorChunks/);
  assert.match(route, /arrayBuffer\(\)/, "binary documents must be fetched as bytes before parsing");
  assert.match(route, /isFinite|Number\.isFinite/, "embedding vectors must reject non-finite numbers");
  assert.match(route, /citation/, "stored chunk metadata must include citation information");
  assert.match(route, /sourceType/, "stored chunk metadata must include the parsed source type");
});

test("optional Qdrant and Milvus vector backends are behind config and use official REST shapes", async () => {
  const src = await readText("apps/web/src/server/vector-backends.ts");

  assert.match(src, /AGENTHUB_VECTOR_BACKEND/);
  assert.match(src, /"postgres" \| "qdrant" \| "milvus"/);
  assert.match(src, /QDRANT_URL/);
  assert.match(src, /QDRANT_COLLECTION/);
  assert.match(src, /\/collections\/\$\{encodeURIComponent\(config\.collection\)\}\/points\?wait=true/);
  assert.match(src, /\/collections\/\$\{encodeURIComponent\(config\.collection\)\}\/points\/search/);
  assert.match(src, /MILVUS_URL/);
  assert.match(src, /MILVUS_COLLECTION/);
  assert.match(src, /\/v1\/vector\/insert/);
  assert.match(src, /\/v1\/vector\/search/);
  assert.match(src, /validateProviderBaseUrl/);
});

test("KB search returns cited chunks and can query configured external vector backends", async () => {
  const src = await readText("apps/web/src/server/kb-search.ts");

  assert.match(src, /searchVectorBackend/);
  assert.match(src, /resolveVectorBackendConfig/);
  assert.match(src, /citation/);
  assert.match(src, /sourceName/);
  assert.match(src, /metadata/);
  assert.match(src, /createChunkCitation/);
});

test("KnowledgeBaseManager advertises all supported ingestion formats", async () => {
  const src = await readText("apps/web/src/components/KnowledgeBaseManager.tsx");

  assert.match(src, /\.pdf,.docx,.csv,.xlsx,.vtt,.srt,.md,.markdown,.ts,.tsx,.js,.jsx,.py,.json/);
  assert.match(src, /Supported: PDF, DOCX, CSV, XLSX, transcripts, code, and Markdown/);
});

test("RAG ingestion E2E registration exists for supported file controls", async () => {
  const spec = await readText("apps/web/tests/e2e/specs/phase-h/kb-ingestion.spec.ts");

  assert.match(spec, /Supported: PDF, DOCX, CSV, XLSX, transcripts, code, and Markdown/);
  assert.match(spec, /toHaveAttribute\(\s*"accept"/);
  assert.match(spec, /\.pdf,.docx,.csv,.xlsx,.vtt,.srt,.md,.markdown,.ts,.tsx,.js,.jsx,.py,.json/);
  assert.match(spec, /getByTestId\("knowledge-base"\)/);
});
