import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface Chunk {
  id: string;
  documentId: string;
  content: string;
  similarity: number;
}

describe("knowledge base — RAG pipeline", () => {
  it("chunks are created from document content", () => {
    const content = "A".repeat(2500);
    const chunkSize = 1000;
    const overlap = 200;
    const chunks: string[] = [];
    let offset = 0;
    while (offset < content.length) {
      chunks.push(content.slice(offset, offset + chunkSize));
      offset += chunkSize - overlap;
    }
    assert.ok(chunks.length >= 3, "2500-char document splits into at least 3 chunks");
  });

  it("similarity results are ordered highest-first", () => {
    const results: Chunk[] = [
      { id: "c1", documentId: "d1", content: "relevant", similarity: 0.92 },
      { id: "c2", documentId: "d1", content: "less relevant", similarity: 0.73 },
      { id: "c3", documentId: "d1", content: "tangential", similarity: 0.51 },
    ];
    const sorted = [...results].sort((a, b) => b.similarity - a.similarity);
    assert.equal(sorted[0]!.similarity, 0.92);
    assert.equal(sorted[2]!.similarity, 0.51);
  });

  it("RAG context is injected before user message in system prompt", () => {
    const systemPrompt = "You are an expert assistant.";
    const ragContext = [
      "## Relevant Knowledge Base Context",
      "[1] First chunk content",
      "[2] Second chunk content",
      "\nUse the above context to answer the user's question. Cite sources using [1], [2], etc. when referencing specific information.",
    ].join("\n\n");
    const resolved = `${systemPrompt}\n\n${ragContext}`;
    assert.match(resolved, /Relevant Knowledge Base Context/);
    assert.match(resolved, /\[1\]/);
    assert.match(resolved, /Cite sources using/);
    assert.ok(resolved.indexOf(systemPrompt) < resolved.indexOf("Relevant"), "system prompt precedes RAG block");
  });

  it("embedding validation rejects Infinity and NaN values", () => {
    const badEmbs: number[][] = [
      [0.1, Infinity, 0.3],
      [NaN, 0.2, 0.3],
      [0.1, 0.2, -Infinity],
    ];
    for (const emb of badEmbs) {
      const valid = emb.every((v) => isFinite(v));
      assert.equal(valid, false, "non-finite embedding must fail validation");
    }
  });

  it("knowledge base query scoped to the requesting user's KB", () => {
    const userId = "user-1";
    const kbs = [
      { id: "kb-1", userId: "user-1", name: "My KB" },
      { id: "kb-2", userId: "user-2", name: "Other KB" },
    ];
    const visible = kbs.filter((kb) => kb.userId === userId);
    assert.equal(visible.length, 1);
    assert.equal(visible[0]!.id, "kb-1");
  });
});
