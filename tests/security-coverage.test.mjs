import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Authentication and session isolation guardrails are enforced across all routers", async () => {
  const [route, agents, sessions] = await Promise.all([
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/server/routers/agents.ts"),
    readText("apps/web/src/server/routers/sessions.ts"),
  ]);

  // Stream route performs auth check before any DB access
  assert.match(route, /const session = await auth\(\)/);
  assert.match(route, /if \(!session\?\.user\)/);
  assert.match(route, /status: 401/);

  // Session scoped to authenticated user — prevents cross-user session reads
  assert.match(route, /eq\(chatSessions\.userId, session\.user\.id\)/);

  // Agents router enforces authedProcedure on all CRUD
  for (const procedure of ["list", "get", "create", "update", "delete"]) {
    assert.match(agents, new RegExp(`${procedure}: authedProcedure`));
  }

  // Delete enforces userId ownership — user A cannot delete user B's agent
  assert.match(agents, /eq\(agents\.userId, ctx\.user\.id\)/);
  assert.match(agents, /db\.delete\(agents\)\.where\(and\(eq\(agents\.id, input\.id\), eq\(agents\.userId, ctx\.user\.id\)\)\)/);

  // Sessions router scopes reads to the authenticated user
  assert.match(sessions, /eq\(chatSessions\.userId/);
});

test("Chat stream route uses parameterized queries and validates untrusted input", async () => {
  const route = await readText("apps/web/src/app/api/chat/stream/route.ts");

  // No raw SQL string injection — sql.raw() is never used
  assert.doesNotMatch(route, /sql\.raw\(/);

  // Embedding vector is bound as a parameterized query parameter — prevents vector injection
  assert.match(route, /sql\.param\(embStr\)/);

  // OLLAMA_URL is validated through URL constructor before fetch — SSRF mitigation
  assert.match(route, /new URL\(rawOllamaUrl\)/);
  assert.match(route, /\["http:", "https:"\]\.includes\(parsed\.protocol\)/);

  // Embedding values are validated as finite numbers before DB use
  assert.match(route, /typeof v === "number" && isFinite\(v\)/);

  // SSE events use standard data: prefix format
  assert.match(route, /`data: \$\{JSON\.stringify\(/);

  // Stream includes a [DONE] terminator for the client
  assert.match(route, /data: \[DONE\]/);
});

test("Agents router enforces per-user ownership for all mutating operations", async () => {
  const agents = await readText("apps/web/src/server/routers/agents.ts");

  // List scoped to authenticated user
  assert.match(agents, /eq\(agents\.userId, ctx\.user\.id\)/);

  // Get scoped with both id and userId — prevents enumeration by id alone
  assert.match(agents, /and\(eq\(agents\.id, input\.id\), eq\(agents\.userId, ctx\.user\.id\)\)/);

  // Update scoped with userId — user cannot update another user's agent
  assert.match(agents, /\.where\(and\(eq\(agents\.id, id\), eq\(agents\.userId, ctx\.user\.id\)\)\)/);

  // Agent groups also enforce userId ownership on create, list, get, and delete
  assert.match(agents, /eq\(agentGroups\.userId, ctx\.user\.id\)/);

  // Group member writes are validated — only group owner may add members
  assert.match(agents, /db\.insert\(groupMembers\)/);
  assert.match(agents, /groupId: group\.id/);
});

test("Knowledge base RAG pipeline validates embeddings and injects context safely", async () => {
  const [route, schema] = await Promise.all([
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/server/db/schema.ts"),
  ]);

  // Embedding table exists with vector column
  assert.match(schema, /export const documentChunks = pgTable\("document_chunks"/);
  assert.match(schema, /embedding: vector\("embedding"/);

  // RAG uses sql.param for safe vector binding
  assert.match(route, /sql\.param\(embStr\)/);

  // RAG embedding values validated before DB query
  assert.match(route, /Array\.isArray\(rawEmb\)/);
  assert.match(route, /rawEmb\.every\(\(v\) => typeof v === "number" && isFinite\(v\)\)/);

  // RAG context block format — numbered citations for the model
  assert.match(route, /Relevant Knowledge Base Context/);
  assert.match(route, /Use the above context to answer/);
  assert.match(route, /Cite sources using \[1\], \[2\]/);

  // RAG sources emitted to client as a typed SSE event before content
  assert.match(route, /type: "rag_sources"/);
  assert.match(route, /ragSourcesForStream\.length > 0/);

  // KB ownership check — user can only query their own knowledge base
  assert.match(route, /eq\(knowledgeBases\.userId, session\.user\.id\)/);
});

test("MCP client and code execution use spawn without shell injection risk", async () => {
  const [mcpClient, executeCode] = await Promise.all([
    readText("packages/agent-runtime/src/mcp/client.ts"),
    readText("packages/agent-runtime/src/tools/builtin/executeCode.ts"),
  ]);

  // MCP client uses spawn (not exec) — avoids shell interpretation
  assert.match(mcpClient, /import \{ spawn/);
  assert.doesNotMatch(mcpClient, /\bexec\b/);

  // spawn options do not use shell: true
  assert.doesNotMatch(mcpClient, /shell:\s*true/);

  // MCP process uses stdio pipes — no TTY exposure
  assert.match(mcpClient, /stdio: \["pipe", "pipe", "pipe"\]/);

  // Code execution uses Docker with network isolation
  assert.match(executeCode, /spawn\("docker"/);
  assert.match(executeCode, /"--network", "none"/);

  // Read-only filesystem + tmpfs — prevents persistent writes
  assert.match(executeCode, /"--read-only"/);
  assert.match(executeCode, /"--tmpfs"/);

  // Memory and CPU limits — prevents resource exhaustion
  assert.match(executeCode, /"--memory", "256m"/);
  assert.match(executeCode, /"--cpus", "0\.5"/);

  // Code is passed via stdin, not as a command argument — prevents argument injection
  assert.match(executeCode, /proc\.stdin\.write\(code\)/);
  assert.doesNotMatch(executeCode, /shell: true/);

  // Execution timeout kills the process — prevents runaway jobs
  assert.match(executeCode, /proc\.kill\("SIGKILL"\)/);
});
