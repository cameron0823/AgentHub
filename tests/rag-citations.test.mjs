import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("RAG inline citation rendering", () => {
  it("insertCitationLinks helper defined in ChatMessage", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /insertCitationLinks/, "helper function must be defined");
  });

  it("insertCitationLinks replaces [N] with markdown anchor link", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /cite-\$\{n\}/, "must produce cite-N hash link");
    assert.match(src, /replace\(\/\\\[/, "must use regex replace for [N] pattern");
  });

  it("insertCitationLinks skips out-of-range citation numbers", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /num < 1 \|\| num > sourceCount/, "must bounds-check citation number");
  });

  it("ReactMarkdown uses displayContent instead of raw message.content", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /\{displayContent\}/, "ReactMarkdown must receive displayContent");
    assert.match(src, /sourceCount.*ragSources/, "sourceCount must derive from ragSources");
  });

  it("custom 'a' renderer wraps cite links in superscript", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /#cite-/, "must detect citation href prefix");
    assert.match(src, /<sup>/, "must wrap citation link in <sup>");
  });

  it("RAG source items have id attributes for anchor navigation", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /id=\{`cite-\$\{i \+ 1\}`\}/, "source item must have id cite-N");
  });

  it("RAG source items display numbered label [N]", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /\[{i \+ 1}\]/, "source item must show [N] label");
  });

  it("RAG source items have scroll-mt for sticky header offset", async () => {
    const src = await readText("apps/web/src/components/ChatMessage.tsx");
    assert.match(src, /scroll-mt/, "source item needs scroll-margin for jump navigation");
  });
});
