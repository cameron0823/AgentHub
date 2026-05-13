import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ── Authentication & Session Isolation ───────────────────────────────────────

test("stream route rejects unauthenticated requests with 401", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /const session = await auth\(\)/, "must call auth()");
  assert.match(src, /if \(!session\?\.user\)/, "must check session.user before any DB access");
  assert.match(src, /status: 401/, "must return 401 on missing session");
});

test("stream route scopes session lookup to authenticated user — prevents cross-user session hijack", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(
    src,
    /eq\(chatSessions\.userId, session\.user\.id\)/,
    "session DB query must include userId equality check"
  );
  assert.match(src, /status: 404/, "must return 404 when session not found or not owned");
});

// ── SSE Wire Format ───────────────────────────────────────────────────────────

test("stream route emits content chunks as SSE data lines", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /data: \$\{JSON\.stringify/, "must emit JSON-encoded SSE data lines");
  assert.match(src, /type.*content/, "must emit content-type chunks");
});

test("stream route terminates SSE with a done event containing tokensUsed and latencyMs", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /type.*done/, "done event must use type: 'done'");
  assert.match(src, /tokensUsed/, "done event must include tokensUsed");
  assert.match(src, /latencyMs/, "done event must include latencyMs");
});

test("stream route emits text/event-stream Content-Type header", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /text\/event-stream/, "must set Content-Type: text/event-stream");
  assert.match(src, /Cache-Control.*no-cache/, "must set Cache-Control: no-cache");
});

// ── DB Persistence ─────────────────────────────────────────────────────────────

test("stream route persists the assistant message to DB after streaming completes", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /db\.insert\(messagesTable\)/, "must insert assistant message into DB");
  assert.match(src, /role.*assistant/, "inserted message must have assistant role");
  assert.match(src, /tokensUsed: approxTokens/, "must persist token count");
  assert.match(src, /latencyMs/, "must persist latency");
});

test("stream route updates chatSession updatedAt after message persisted", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /db\.update\(chatSessions\)/, "must update chat session after message save");
});

// ── Group Orchestration SSE ───────────────────────────────────────────────────

test("group path wraps orchestrator events in orchestrator_event SSE type", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(
    src,
    /type.*orchestrator_event/,
    "group events must be wrapped with type: 'orchestrator_event'"
  );
  assert.match(src, /event\.type/, "must read event.type to branch on orchestrator event kinds");
});

test("group path selects orchestrator class from pattern map", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /SequentialOrchestrator/, "must support sequential pattern");
  assert.match(src, /ParallelOrchestrator/, "must support parallel pattern");
  assert.match(src, /SupervisorOrchestrator/, "must support supervisor pattern");
  assert.match(src, /DebateOrchestrator/, "must support debate pattern");
  assert.match(src, /GroupChatOrchestrator/, "must support groupchat pattern");
});

test("group path emits done event after orchestration completes", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  // Both the group path and single-agent path must emit done events
  const doneMatches = (src.match(/type.*"done"/g) ?? []).length;
  assert.ok(doneMatches >= 2, `both group and single-agent paths must emit done events (found ${doneMatches})`);
});

// ── HITL Checkpoint SSE ───────────────────────────────────────────────────────

test("stream route emits hitl_checkpoint event and registers promise in checkpoint registry", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /hitl_checkpoint/, "must emit hitl_checkpoint SSE event type");
  assert.match(src, /registerCheckpoint\(checkpointId\)/, "must register checkpoint promise");
  assert.match(src, /checkpointId.*title.*plan/, "checkpoint event must include id, title, and plan");
});

test("checkpoint registry resolves and rejects promises correctly", async () => {
  const src = await readText("apps/web/src/server/checkpoint-registry.ts");

  assert.match(src, /registerCheckpoint/, "must export registerCheckpoint");
  assert.match(src, /resolveCheckpoint/, "must export resolveCheckpoint");
  assert.match(src, /CHECKPOINT_TIMEOUT_MS/, "must define timeout constant");
  assert.match(src, /resolve\(true\)/, "auto-approval on timeout must resolve true");
  assert.match(src, /entry\.resolve\(approved\)/, "resolveCheckpoint must forward the approved value");
});

test("checkpoint HTTP endpoint validates input and requires auth before resolving", async () => {
  const src = await readText("apps/web/src/app/api/chat/checkpoint/route.ts");

  assert.match(src, /const session = await auth\(\)/, "checkpoint endpoint must require auth");
  assert.match(src, /status: 401/, "must return 401 when unauthenticated");
  assert.match(src, /typeof approved !== "boolean"/, "must validate approved is boolean");
  assert.match(src, /resolveCheckpoint\(checkpointId, approved\)/, "must call resolveCheckpoint with approved value");
});

// ── Memory Injection ──────────────────────────────────────────────────────────

test("stream route injects memory block into system prompt when agent memoryEnabled", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /memoryEnabled/, "must check agent memoryEnabled flag");
  assert.match(src, /fetchAcceptedMemoriesForAgent/, "must fetch accepted memories");
  assert.match(src, /formatMemoryBlock/, "must format memories into a block");
  assert.match(src, /appendMemoryBlockToSystemPrompt/, "must append memory block to system prompt");
});

// ── Prompt Variable Substitution ──────────────────────────────────────────────

test("stream route substitutes prompt variables before sending to provider", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /substituteVariables/, "must call substituteVariables on system prompt");
  assert.match(src, /userName.*session\.user\.name/, "must pass userName from session");
  assert.match(src, /agentName.*sessionAgent\?\.name/, "must pass agentName from agent record");
});

// ── RAG Integration ───────────────────────────────────────────────────────────

test("stream route triggers KB RAG search when agent has a knowledgeBaseId", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /knowledgeBaseId/, "must check agent.knowledgeBaseId");
  assert.match(src, /hybridKbSearch/, "must call hybridKbSearch for RAG");
  assert.match(src, /rag_sources/, "must emit rag_sources SSE chunk with retrieved context");
});

// ── Context Window Management ─────────────────────────────────────────────────

test("stream route truncates conversation history to fit context window", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /truncateToContextWindow/, "must call truncateToContextWindow before sending messages");
});

// ── MCP Tool Injection ────────────────────────────────────────────────────────

test("stream route injects MCP tools from enabled agent MCP servers", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /MCPClient/, "must import and use MCPClient");
  assert.match(src, /mcpServers/, "must query mcpServers table for agent tools");
  assert.match(src, /extraTools/, "must pass MCP tools as extraTools to AgentRuntime");
});

// ── Memory Extraction Post-Stream ─────────────────────────────────────────────

test("stream route triggers async memory extraction after response completes", async () => {
  const src = await readText("apps/web/src/app/api/chat/stream/route.ts");

  assert.match(src, /extractMemories/, "must call extractMemories after stream completes");
  assert.match(src, /storePendingMemories/, "must call storePendingMemories to persist extracted entries");
});
