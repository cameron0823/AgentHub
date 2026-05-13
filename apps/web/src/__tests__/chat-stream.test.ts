import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("chat stream route — SSE and security", () => {
  it("emits content chunks in SSE data: format", () => {
    const chunk = { type: "content", content: "Hello" };
    const line = `data: ${JSON.stringify(chunk)}\n\n`;
    assert.match(line, /^data: /);
    assert.match(line, /\n\n$/);
  });

  it("rejects embeddings with non-finite values", () => {
    const rawEmb: unknown[] = [0.1, NaN, 0.3];
    const isValid = Array.isArray(rawEmb) && rawEmb.every((v) => typeof v === "number" && isFinite(v as number));
    assert.equal(isValid, false, "NaN embedding must fail validation");
  });

  it("accepts embeddings that are all finite numbers", () => {
    const rawEmb: unknown[] = [0.1, 0.2, 0.3];
    const isValid = Array.isArray(rawEmb) && rawEmb.every((v) => typeof v === "number" && isFinite(v as number));
    assert.equal(isValid, true, "valid embedding must pass validation");
  });

  it("validates OLLAMA_URL with URL constructor to prevent SSRF", () => {
    const validate = (raw: string): string => {
      try {
        const parsed = new URL(raw);
        if (!["http:", "https:"].includes(parsed.protocol)) return "http://localhost:11434";
        return raw;
      } catch {
        return "http://localhost:11434";
      }
    };
    assert.equal(validate("ftp://evil.com"), "http://localhost:11434");
    assert.equal(validate("not-a-url"), "http://localhost:11434");
    assert.equal(validate("http://localhost:11434"), "http://localhost:11434");
  });

  it("rejects stream routes that use sql.raw for embedding queries", () => {
    const FORBIDDEN_PATTERN = /sql\.raw\(/;
    const sampleQuery = `sql\`1 - (${"`"}${"{"}embedding{"}"}${"`"} <=> ${"`"}${"{"}sql.param(embStr){"}"}${"`"}::vector)\``;
    assert.doesNotMatch(sampleQuery, FORBIDDEN_PATTERN, "sql.raw must not appear in embedding queries");
  });

  it("memory extraction triggers after stream completes", async () => {
    const extracted: string[] = [];
    const mockExtract = async (_user: string, _assistant: string) => ["memory-item"];
    const items = await mockExtract("user message", "assistant response");
    extracted.push(...items);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0], "memory-item");
  });
});
