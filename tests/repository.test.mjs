import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Turbo uses tasks and exposes required tasks", async () => {
  const turbo = await readJson("turbo.json");
  assert.ok(turbo.tasks, "turbo.json must use tasks");
  assert.equal(turbo.pipeline, undefined, "turbo.json must not use legacy pipeline");
  for (const task of ["build", "lint", "typecheck", "test", "test:e2e"]) {
    assert.ok(turbo.tasks[task], `missing turbo task: ${task}`);
  }
  assert.equal(turbo.tasks["test:e2e"].cache, false);
});

test("root package exposes pnpm workflow scripts", async () => {
  const pkg = await readJson("package.json");
  for (const script of ["test", "test:e2e", "typecheck", "lint", "build", "db:generate", "db:push", "dev"]) {
    assert.ok(pkg.scripts[script], `missing root script: ${script}`);
  }
  assert.match(pkg.packageManager, /^pnpm@/);
});

test("Playwright browser smoke stack is configured for deterministic local e2e", async () => {
  const [rootPkg, webPkg, config, smoke] = await Promise.all([
    readJson("package.json"),
    readJson("apps/web/package.json"),
    readText("apps/web/playwright.config.ts"),
    readText("apps/web/e2e/chat-smoke.spec.ts"),
  ]);

  assert.equal(rootPkg.scripts["test:e2e"], "turbo run test:e2e");
  assert.equal(webPkg.scripts["test:e2e"], "playwright test");
  assert.ok(webPkg.devDependencies["@playwright/test"], "missing @playwright/test devDependency");
  assert.match(config, /devices\["Desktop Chrome"\]/);
  assert.match(config, /command: "pnpm dev"/);
  assert.match(config, /url: "http:\/\/127\.0\.0\.1:3000"/);
  assert.match(config, /DATABASE_URL: "file:\.\/data\/e2e-agenthub\.db"/);
  assert.match(smoke, /\/api\/trpc\/\*\*/);
  assert.match(smoke, /\/api\/chat\/stream/);
});

test("workspace packages and required project files exist", async () => {
  const workspace = await readText("pnpm-workspace.yaml");
  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);

  const files = await Promise.all([
    readText(".env.example"),
    readText("LICENSE"),
    readText("apps/web/drizzle.config.ts"),
  ]);
  assert.ok(files.every((contents) => contents.length > 0));
});

test("CI runs on the repository default branch", async () => {
  const workflow = await readText(".github/workflows/ci.yml");
  assert.match(workflow, /branches:\s*\[master, main\]/);
});

test("Ollama env example matches provider configuration", async () => {
  const [envExample, ollamaProvider] = await Promise.all([
    readText(".env.example"),
    readText("packages/ai-providers/src/providers/ollama.ts"),
  ]);

  assert.match(ollamaProvider, /process\.env\.OLLAMA_URL/);
  assert.match(envExample, /^OLLAMA_URL=/m);
  assert.doesNotMatch(envExample, /^OLLAMA_BASE_URL=/m);
});

test("OpenAI-compatible local providers are registered with default env URLs", async () => {
  const [envExample, registry, lmstudioProvider, vllmProvider, helper] = await Promise.all([
    readText(".env.example"),
    readText("packages/ai-providers/src/registry.ts"),
    readText("packages/ai-providers/src/providers/lmstudio.ts"),
    readText("packages/ai-providers/src/providers/vllm.ts"),
    readText("packages/ai-providers/src/providers/openai-compatible.ts"),
  ]);

  assert.match(envExample, /^LMSTUDIO_URL=http:\/\/localhost:1234$/m);
  assert.match(envExample, /^VLLM_URL=http:\/\/localhost:8000$/m);
  assert.match(lmstudioProvider, /process\.env\.LMSTUDIO_URL \|\| "http:\/\/localhost:1234"/);
  assert.match(vllmProvider, /process\.env\.VLLM_URL \|\| "http:\/\/localhost:8000"/);
  assert.match(registry, /new LMStudioProvider\(\)/);
  assert.match(registry, /new VLLMProvider\(\)/);
  assert.match(helper, /\/v1\/models/);
  assert.match(helper, /\/v1\/chat\/completions/);
  assert.match(helper, /mergeToolCallChunk/);
});

test("Provider registry emits and resolves qualified model IDs", async () => {
  const registry = await readText("packages/ai-providers/src/registry.ts");

  assert.match(registry, /DEFAULT_QUALIFIED_MODEL_ID = "ollama:qwen2\.5:7b"/);
  assert.match(registry, /qualifyModelId\(provider\.id, m\.id\)/);
  assert.match(registry, /splitQualifiedModelId/);
  assert.match(registry, /resolveModel\(modelId: string\)/);
  assert.match(registry, /hasKnownProviderPrefix/);
});

test("README setup uses pnpm commands", async () => {
  const readme = await readText("README.md");
  assert.match(readme, /corepack enable/);
  assert.match(readme, /pnpm install/);
  assert.match(readme, /pnpm db:generate/);
  assert.match(readme, /pnpm dev/);
  assert.doesNotMatch(readme, /^npm install$/m);
  assert.doesNotMatch(readme, /^npm run dev$/m);
});

test("Next 15 migration keeps React 18 and uses supported lint/config paths", async () => {
  const [pkg, nextConfig, gitignore] = await Promise.all([
    readJson("apps/web/package.json"),
    readText("apps/web/next.config.js"),
    readText(".gitignore"),
  ]);

  assert.match(pkg.dependencies.next, /^15\./);
  assert.equal(pkg.dependencies.react, "18.3.1");
  assert.equal(pkg.dependencies["react-dom"], "18.3.1");
  assert.match(pkg.devDependencies["eslint-config-next"], /^15\./);
  assert.equal(pkg.scripts.lint, "eslint .");
  assert.match(nextConfig, /serverExternalPackages:\s*\["postgres"\]/);
  assert.doesNotMatch(nextConfig, /serverComponentsExternalPackages/);
  assert.match(gitignore, /^\.turbo\/$/m);
});

test("SQLite-backed route handlers explicitly use the Node runtime", async () => {
  const [chatRoute, trpcRoute] = await Promise.all([
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/app/api/trpc/[trpc]/route.ts"),
  ]);

  assert.match(chatRoute, /export const runtime = "nodejs";/);
  assert.match(trpcRoute, /export const runtime = "nodejs";/);
});

test("Provider catalog powers model selector and persisted session model", async () => {
  const [router, chatInterface, modelSelector] = await Promise.all([
    readText("apps/web/src/server/routers/providers.ts"),
    readText("apps/web/src/components/ChatInterface.tsx"),
    readText("apps/web/src/components/ModelSelector.tsx"),
  ]);

  assert.match(router, /catalog:\s*authedProcedure\.query/);
  assert.match(router, /providerStatus/);
  assert.match(router, /providerLatency/);
  assert.match(chatInterface, /<ModelSelector sessionId=\{activeSession\.id\} \/>/);
  assert.doesNotMatch(chatInterface, /<option value="qwen2\.5:14b">/);
  assert.match(modelSelector, /trpc\.providers\.catalog\.useQuery/);
  assert.match(modelSelector, /trpc\.sessions\.update\.useMutation/);
  assert.match(modelSelector, /DEFAULT_MODEL_ID/);
  assert.match(modelSelector, /displayModelLabel/);
  assert.match(modelSelector, /Local Ollama is unavailable/);
});

test("Chat runtime and stream route use qualified providers and abort signals", async () => {
  const [runtime, types, route, ollamaProvider] = await Promise.all([
    readText("packages/agent-runtime/src/runtime.ts"),
    readText("packages/agent-runtime/src/types.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("packages/ai-providers/src/providers/ollama.ts"),
  ]);

  assert.match(runtime, /providerRegistry\.resolveModel\(this\.options\.model\)/);
  assert.match(runtime, /model,/);
  assert.match(types, /signal\?: AbortSignal/);
  assert.match(route, /signal: req\.signal/);
  assert.match(route, /!fullContent && !fullReasoning && toolCalls\.length === 0/);
  assert.match(ollamaProvider, /signal: options\.signal/);
});

test("Chat UI exposes stop controls and deterministic auto-title generation", async () => {
  const [chatInput, chatInterface, titleHelper] = await Promise.all([
    readText("apps/web/src/components/ChatInput.tsx"),
    readText("apps/web/src/components/ChatInterface.tsx"),
    readText("apps/web/src/lib/title.ts"),
  ]);

  assert.match(chatInput, /onStop: \(\) => void/);
  assert.match(chatInput, /Stop generation/);
  assert.match(chatInput, /<Square/);
  assert.match(chatInterface, /abortRef\.current\?\.abort\(\)/);
  assert.match(chatInterface, /generateSessionTitle\(content\)/);
  assert.match(chatInterface, /shouldAutoTitle\(activeSession\?\.title\)/);
  assert.match(titleHelper, /export function generateSessionTitle/);
  assert.match(titleHelper, /MAX_TITLE_LENGTH/);
});

test("Tool runtime exposes default tools and safe execution foundations", async () => {
  const [runtimeIndex, calculator, readFileTool, registry] = await Promise.all([
    readText("packages/agent-runtime/src/index.ts"),
    readText("packages/agent-runtime/src/tools/builtin/calculator.ts"),
    readText("packages/agent-runtime/src/tools/builtin/read-file.ts"),
    readText("packages/agent-runtime/src/tools/registry.ts"),
  ]);

  assert.match(runtimeIndex, /readFileTool/);
  assert.match(calculator, /function evaluateExpression/);
  assert.doesNotMatch(calculator, /new Function/);
  assert.match(readFileTool, /AGENTHUB_READ_FILE_ROOT/);
  assert.match(readFileTool, /Path is outside the allowed read_file root/);
  assert.match(registry, /timeoutMs/);
  assert.match(registry, /Promise\.race/);
});

test("Ollama provider streams tool calls and preserves tool metadata", async () => {
  const ollamaProvider = await readText("packages/ai-providers/src/providers/ollama.ts");

  assert.match(ollamaProvider, /normalizeToolCalls\(data\.message\?\.tool_calls\)/);
  assert.match(ollamaProvider, /yield \{ type: "tool_call", toolCall \}/);
  assert.match(ollamaProvider, /message\.tool_call_id = m\.tool_call_id/);
  assert.match(ollamaProvider, /message\.tool_calls = m\.tool_calls/);
  assert.match(ollamaProvider, /extractReasoning/);
});

test("Web UI renders and persists tool-call metadata", async () => {
  const [toolCallCard, chatMessage, chatInterface, router] = await Promise.all([
    readText("apps/web/src/components/ToolCallCard.tsx"),
    readText("apps/web/src/components/ChatMessage.tsx"),
    readText("apps/web/src/components/ChatInterface.tsx"),
    readText("apps/web/src/server/routers/sessions.ts"),
  ]);

  assert.match(toolCallCard, /Tool call/);
  assert.match(chatMessage, /<ToolCallCard/);
  assert.match(chatInterface, /chunk\.type === "tool_call"/);
  assert.match(chatInterface, /chunk\.type === "tool_result"/);
  assert.match(router, /toolCalls: z\.string\(\)\.optional\(\)/);
});

test("Chat UI virtualizes variable-height message rendering", async () => {
  const [chatInterface, virtualizedList, pkg] = await Promise.all([
    readText("apps/web/src/components/ChatInterface.tsx"),
    readText("apps/web/src/components/VirtualizedMessageList.tsx"),
    readJson("apps/web/package.json"),
  ]);

  assert.match(chatInterface, /VirtualizedMessageList/);
  assert.match(chatInterface, /messages=\{activeSession\.messages\}/);
  assert.doesNotMatch(chatInterface, /activeSession\.messages\.map/);
  assert.equal(pkg.dependencies["react-virtuoso"], "^4.14.0");
  assert.match(virtualizedList, /import \{ Virtuoso, type VirtuosoHandle \} from "react-virtuoso"/);
  assert.match(virtualizedList, /followOutput="smooth"/);
  assert.match(virtualizedList, /key=\{messages\.length\}/);
  assert.match(virtualizedList, /alignToBottom/);
  assert.match(virtualizedList, /initialTopMostItemIndex=\{\{ index: messages\.length - 1, align: "end" \}\}/);
  assert.match(virtualizedList, /scrollToIndex\(\{ index: messages\.length - 1, align: "end", behavior: "auto" \}\)/);
  assert.match(virtualizedList, /window\.setTimeout\(scrollToLatest, 50\)/);
  assert.match(virtualizedList, /window\.setInterval\(scrollToLatest, 100\)/);
  assert.match(virtualizedList, /increaseViewportBy=\{\{ top: 600, bottom: 600 \}\}/);
  assert.match(virtualizedList, /<ChatMessageItem message=\{message\} \/>/);
});

test("Markdown rendering supports GFM and KaTeX math", async () => {
  const [chatMessage, layout, pkg] = await Promise.all([
    readText("apps/web/src/components/ChatMessage.tsx"),
    readText("apps/web/src/app/layout.tsx"),
    readJson("apps/web/package.json"),
  ]);

  assert.equal(pkg.dependencies["remark-math"], "^6.0.0");
  assert.equal(pkg.dependencies["rehype-katex"], "^7.0.0");
  assert.equal(pkg.dependencies.katex, "^0.16.11");
  assert.match(chatMessage, /import remarkMath from "remark-math"/);
  assert.match(chatMessage, /import rehypeKatex from "rehype-katex"/);
  assert.match(chatMessage, /remarkPlugins=\{\[remarkGfm, remarkMath\]\}/);
  assert.match(chatMessage, /rehypePlugins=\{\[rehypeKatex\]\}/);
  assert.match(layout, /import "katex\/dist\/katex\.min\.css"/);
});

test("Initial Drizzle migration defaults use qualified model IDs", async () => {
  const [migration, snapshot, schema] = await Promise.all([
    readText("apps/web/drizzle/0000_flippant_captain_america.sql"),
    readJson("apps/web/drizzle/meta/0000_snapshot.json"),
    readText("apps/web/src/server/db/schema.ts"),
  ]);

  assert.match(schema, /model: text\("model"\)\.default\("ollama:qwen2\.5:7b"\)/);
  assert.match(migration, /CREATE TABLE "chat_sessions"[\s\S]*"model" text DEFAULT 'ollama:qwen2\.5:7b'/);
  assert.match(migration, /CREATE TABLE "agents"[\s\S]*"model" text DEFAULT 'ollama:qwen2\.5:7b'/);
  assert.equal(snapshot.tables["public.chat_sessions"].columns.model.default, "'ollama:qwen2.5:7b'");
  assert.equal(snapshot.tables["public.agents"].columns.model.default, "'ollama:qwen2.5:7b'");
});

test("Agent Builder MVP links sessions to agents and exposes agent API", async () => {
  const [schema, migration, snapshot, router, store] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0000_flippant_captain_america.sql"),
    readJson("apps/web/drizzle/meta/0000_snapshot.json"),
    Promise.all([
      readText("apps/web/src/server/routers/agents.ts"),
      readText("apps/web/src/server/routers/sessions.ts"),
    ]).then(([a, s]) => a + s),
    readText("apps/web/src/stores/chatStore.ts"),
  ]);

  assert.match(schema, /agentId: uuid\("agent_id"\)\.references\(\(\) => agents\.id, \{ onDelete: "set null" \}\)/);
  assert.match(migration, /"agent_id" uuid/);
  assert.equal(snapshot.tables["public.chat_sessions"].columns.agent_id.notNull, false);
  assert.equal(snapshot.tables["public.chat_sessions"].foreignKeys.chat_sessions_agent_id_agents_id_fk.onDelete, "set null");
  assert.match(router, /agentsRouter = router\(\{/);
  for (const procedure of ["list", "get", "create", "update", "delete"]) {
    assert.match(router, new RegExp(`${procedure}: authedProcedure`));
  }
  assert.match(router, /tools: JSON\.stringify\(input\.tools \|\| \[\]\)/);
  assert.match(router, /agentId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(router, /title: input\.title \|\| group\?\.name \|\| agent\?\.name \|\| "New Chat"/);
  assert.match(store, /export interface Agent/);
  assert.match(store, /agentId\?: string \| null/);
  assert.match(store, /mainView: MainView/);
});

test("Agent Builder UI and stream route apply agent runtime configuration", async () => {
  const [builder, list, sidebar, page, route] = await Promise.all([
    readText("apps/web/src/components/AgentBuilder.tsx"),
    readText("apps/web/src/components/AgentList.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
    readText("apps/web/src/app/page.tsx"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
  ]);

  assert.match(builder, /Basics/);
  assert.match(builder, /Persona/);
  assert.match(builder, /Capabilities/);
  assert.match(list, /Search agents/);
  assert.match(list, /Start chat/);
  assert.match(sidebar, /trpc\.agents\.list\.useQuery/);
  assert.match(sidebar, /createSession\.mutate\(\{ agentId \}\)/);
  assert.match(page, /mainView === "agent-builder" \? <AgentBuilder \/>/);
  assert.match(page, /<ChatInterface \/>/);
  assert.match(route, /const systemPrompt = appendMemoryBlockToSystemPrompt\(sessionAgent\?\.systemPrompt, memoryBlock\)/);
  assert.match(route, /systemPrompt,/);
  assert.match(route, /temperature: sessionAgent\?\.temperature \?\? temperature/);
  assert.match(route, /maxTokens: sessionAgent\?\.maxTokens \?\? maxTokens/);
  assert.match(route, /const effectiveTools = sessionAgent \? parseAgentTools\(sessionAgent\.tools\) : \(tools \|\| \["calculator", "datetime"\]\)/);
  assert.doesNotMatch(route, /tools: tools \|\| \["calculator", "datetime", "read_file"\]/);
});

test("Sidebar supports persisted rename states and guarded delete", async () => {
  const [sidebar, store] = await Promise.all([
    readText("apps/web/src/components/Sidebar.tsx"),
    readText("apps/web/src/stores/chatStore.ts"),
  ]);

  assert.match(sidebar, /trpc\.sessions\.update\.useMutation/);
  assert.match(sidebar, /Double-click to rename/);
  assert.match(sidebar, /Loading conversations/);
  assert.match(sidebar, /Could not load conversations/);
  assert.match(sidebar, /window\.confirm/);
  assert.match(store, /updateSession:/);
  assert.match(store, /selectedModel:\s*activeSession\?\.model/);
});

test("Multi-agent orchestration MVP exposes runtime, schema, router, stream route, and UI", async () => {
  const [
    runtimeIndex,
    sequential,
    parallel,
    schema,
    router,
    groupRoute,
    store,
    page,
    sidebar,
    groupBuilder,
    groupList,
  ] = await Promise.all([
    readText("packages/agent-runtime/src/index.ts"),
    readText("packages/agent-runtime/src/orchestrators/sequential.ts"),
    readText("packages/agent-runtime/src/orchestrators/parallel.ts"),
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/src/server/routers/agents.ts"),
    readText("apps/web/src/app/api/groups/stream/route.ts"),
    readText("apps/web/src/stores/chatStore.ts"),
    readText("apps/web/src/app/page.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
    readText("apps/web/src/components/AgentGroupBuilder.tsx"),
    readText("apps/web/src/components/AgentGroupList.tsx"),
  ]);

  assert.match(runtimeIndex, /export \* from "\.\/orchestrators"/);
  assert.match(sequential, /export class SequentialOrchestrator/);
  assert.match(sequential, /type: "group_start"/);
  assert.match(sequential, /type: "agent_start"/);
  assert.match(sequential, /type: "agent_output"/);
  assert.match(sequential, /type: "group_complete"/);
  assert.match(parallel, /export class ParallelOrchestrator/);
  assert.match(parallel, /Promise\.allSettled/);
  assert.match(schema, /export const agentGroups = pgTable\("agent_groups"/);
  assert.match(schema, /export const groupMembers = pgTable\("group_members"/);
  assert.match(schema, /groupId: uuid\("group_id"\)\.references\(\(\) => agentGroups\.id, \{ onDelete: "set null" \}\)/);
  assert.match(router, /agentGroupsRouter = router\(\{/);
  for (const procedure of ["list", "get", "create", "update", "delete"]) {
    assert.match(router, new RegExp(`${procedure}: authedProcedure`));
  }
  assert.match(router, /validateAgentIds/);
  assert.match(router, /db\.insert\(groupMembers\)/);
  assert.match(groupRoute, /export const runtime = "nodejs"/);
  assert.match(groupRoute, /new ParallelOrchestrator\(\)/);
  assert.match(groupRoute, /new SequentialOrchestrator\(\)/);
  assert.match(groupRoute, /role: "assistant"/);
  assert.match(store, /export interface AgentGroup/);
  assert.match(store, /"group-builder"/);
  assert.match(page, /<AgentGroupBuilder \/>/);
  assert.match(sidebar, /trpc\.agentGroups\.list\.useQuery/);
  assert.match(sidebar, /createSession\.mutate\(\{ groupId \}\)/);
  assert.match(groupBuilder, /Save Group/);
  assert.match(groupList, /No groups yet/);
});

test("White-box Memory MVP exposes schema, API, prompt helper, store, and UI", async () => {
  const [schema, router, helper, route, store, page, sidebar, editor] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/src/server/routers/memory.ts"),
    readText("apps/web/src/server/memory.ts"),
    readText("apps/web/src/app/api/chat/stream/route.ts"),
    readText("apps/web/src/stores/chatStore.ts"),
    readText("apps/web/src/app/page.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
    readText("apps/web/src/components/MemoryEditor.tsx"),
  ]);

  assert.match(schema, /export const memoryEntries = pgTable\("memory_entries"/);
  assert.match(schema, /agentId: uuid\("agent_id"\)\.references\(\(\) => agents\.id, \{ onDelete: "set null" \}\)/);
  assert.match(schema, /sourceMessageId: uuid\("source_message_id"\)\.references\(\(\) => messages\.id, \{ onDelete: "set null" \}\)/);
  assert.match(schema, /status: text\("status"/);
  assert.match(schema, /isEdited: boolean\("is_edited"\)/);
  assert.match(router, /memoryEntriesRouter = router\(\{/);
  for (const procedure of ["list", "create", "update", "delete"]) {
    assert.match(router, new RegExp(`${procedure}: authedProcedure`));
  }
  assert.match(router, /clampConfidence/);
  assert.match(router, /status: input\.status \|\| "accepted"/);
  assert.match(helper, /fetchAcceptedMemoriesForAgent/);
  assert.match(helper, /Relevant saved memories:/);
  assert.match(helper, /MAX_MEMORY_ENTRIES/);
  assert.match(route, /fetchAcceptedMemoriesForAgent\(sessionAgent\.id\)/);
  assert.match(route, /appendMemoryBlockToSystemPrompt/);
  assert.match(route, /sessionAgent\?\.memoryEnabled/);
  assert.match(store, /export interface MemoryEntry/);
  assert.match(store, /"memory-editor"/);
  assert.match(page, /<MemoryEditor \/>/);
  assert.match(sidebar, />\s*Memory\s*</);
  assert.match(editor, /trpc\.memoryEntries\.list\.useQuery/);
  assert.match(editor, /Create memory/);
  assert.match(editor, /Accepted entries are injected transparently/);
});

test("Agent Marketplace MVP exposes strict local manifests, API procedures, and UI wiring", async () => {
  const [manifest, router, store, page, sidebar, marketplace] = await Promise.all([
    readText("apps/web/src/server/marketplace/manifest.ts"),
    readText("apps/web/src/server/routers/marketplace.ts"),
    readText("apps/web/src/stores/chatStore.ts"),
    readText("apps/web/src/app/page.tsx"),
    readText("apps/web/src/components/Sidebar.tsx"),
    readText("apps/web/src/components/AgentMarketplace.tsx"),
  ]);

  assert.match(manifest, /MARKETPLACE_SCHEMA_VERSION = "agenthub\.marketplace\.v1"/);
  assert.match(manifest, /SUPPORTED_MARKETPLACE_TOOLS = \["calculator", "datetime", "read_file"\]/);
  assert.match(manifest, /\.strict\(\)\.superRefine/);
  assert.match(manifest, /Duplicate agent localKey/);
  assert.match(manifest, /\.min\(1, "Manifest must include at least one agent\."\)/);
  assert.match(manifest, /model: z\.string\(\)\.trim\(\)\.min\(1\)\.default\(DEFAULT_MARKETPLACE_MODEL\)/);
  assert.match(manifest, /memoryEnabled: z\.boolean\(\)\.default\(true\)/);
  assert.match(manifest, /bundledMarketplaceCatalog/);
  assert.match(manifest, /research-copilot/);
  assert.match(manifest, /developer-utility-pack/);
  assert.match(manifest, /daily-operator/);
  assert.match(manifest, /createAgentExportManifest/);
  assert.doesNotMatch(manifest, /sessions/);
  assert.doesNotMatch(manifest, /messages/);
  assert.doesNotMatch(manifest, /memoryEntries/);
  assert.doesNotMatch(manifest, /DATABASE_URL/);

  assert.match(router, /marketplaceRouter = router\(\{/);
  for (const procedure of ["catalog", "validateManifest", "installManifest", "installCatalogItem", "exportAgent"]) {
    assert.match(router, new RegExp(`${procedure}: publicProcedure`));
  }
  assert.match(router, /parseMarketplaceManifest\(input\)/);
  assert.match(router, /db\.insert\(agents\)/);
  assert.match(router, /id: crypto\.randomUUID\(\)/);
  assert.match(router, /tools: JSON\.stringify\(agent\.tools\)/);
  assert.match(router, /createAgentExportManifest\(agent\)/);

  assert.match(store, /"marketplace"/);
  assert.match(page, /<AgentMarketplace \/>/);
  assert.match(sidebar, /setMainView\("marketplace"\)/);
  assert.match(sidebar, />\s*Marketplace\s*</);
  assert.match(marketplace, /Agent Marketplace/);
  assert.match(marketplace, /Local Catalog/);
  assert.match(marketplace, /Paste Import Manifest/);
  assert.match(marketplace, /Export Local Agent/);
  assert.match(marketplace, /trpc\.marketplace\.catalog\.useQuery/);
  assert.match(marketplace, /trpc\.marketplace\.installCatalogItem\.useMutation/);
  assert.match(marketplace, /trpc\.marketplace\.validateManifest\.useMutation/);
  assert.match(marketplace, /trpc\.marketplace\.installManifest\.useMutation/);
  assert.match(marketplace, /trpc\.marketplace\.exportAgent\.useMutation/);
  assert.match(marketplace, /utils\.agents\.list\.invalidate\(\)/);
  assert.match(marketplace, /without remote marketplace fetches/);
});
