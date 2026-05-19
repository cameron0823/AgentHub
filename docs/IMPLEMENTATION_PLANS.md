# AgentHub — Concrete Implementation Plans

> **Decisions locked**: Copilot public client ID · Gemini API-key-only · MCP in DB · Memory extraction after every response  
> **Last updated**: 2026-05-15
> **Status**: Archived early execution plan. Root `TODO.md` is the canonical current tracker; root `IMPLEMENTATION_PLANS.md` preserves the completed detailed playbook.

---

## Plan 0 — Create `.env.example` _(~30 min)_

**Why first**: `tests/repository.test.mjs` asserts this file exists. CI is currently broken without it.

### Files to create

**`.env.example`** (repo root):

```bash
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://agenthub:agenthub@localhost:5432/agenthub

# ── Auth (NextAuth + Casdoor OIDC) ───────────────────────
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-in-production

CASDOOR_ENDPOINT=http://localhost:8000
CASDOOR_CLIENT_ID=
CASDOOR_CLIENT_SECRET=
CASDOOR_APP_NAME=app-agenthub
CASDOOR_ORG_NAME=built-in
CASDOOR_REDIRECT_URI=http://localhost:3000/api/auth/callback/casdoor

# ── Object Storage (MinIO / S3) ───────────────────────────
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=agenthub-uploads
AWS_REGION=us-east-1

# ── AI Providers (local defaults — no keys needed for Ollama/LMStudio) ──
OLLAMA_BASE_URL=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234
VLLM_BASE_URL=http://localhost:8001

# ── GitHub Copilot OAuth (device flow — public client ID, no secret needed) ──
# Uses the published VS Code extension client ID. Safe to commit.
GITHUB_COPILOT_CLIENT_ID=Iv1.b507a08c87ecfe98

# ── Redis (optional — not yet used by application code) ──────
REDIS_URL=redis://localhost:6379
```

### Acceptance

- `npm test` passes (repository.test.mjs no longer fails on `readText(".env.example")`)
- No real secrets in the file — only placeholders and the public Copilot client ID

---

## Plan 1 — Split `_app.ts` Into Domain Sub-Routers _(2–4 hr)_

**Why**: 906 lines, violates 200 LOC rule, blocks parallel development.

### Target structure

```
apps/web/src/server/routers/
  _app.ts          ← wiring only (import + merge, <30 lines)
  agents.ts        ← agents + agentGroups + groupMembers procedures
  sessions.ts      ← chatSessions + messages procedures
  memory.ts        ← memoryEntries procedures
  kb.ts            ← knowledgeBases + documents + files procedures
  providers.ts     ← providerCredentials + providers procedures
  marketplace.ts   ← marketplace procedures
```

### Step-by-step

1. Create each sub-router file with its procedures extracted verbatim from `_app.ts`
2. Each file exports `export const agentsRouter = router({ ... })`
3. New `_app.ts`:

```typescript
import { router } from "../trpc";
import { agentsRouter } from "./routers/agents";
import { sessionsRouter } from "./routers/sessions";
import { memoryRouter } from "./routers/memory";
import { kbRouter } from "./routers/kb";
import { providersRouter } from "./routers/providers";
import { marketplaceRouter } from "./routers/marketplace";

export const appRouter = router({
  agents: agentsRouter,
  sessions: sessionsRouter,
  memory: memoryRouter,
  kb: kbRouter,
  providers: providersRouter,
  marketplace: marketplaceRouter,
});

export type AppRouter = typeof appRouter;
```

4. Update all client-side tRPC call sites — procedure paths change:
   - `trpc.agents.list` → stays same (namespace preserved)
   - `trpc.sessions.fork` → stays same
   - No call sites need to change IF namespace keys match current procedure groupings

### Acceptance

- `npm run typecheck` passes
- All tRPC call sites compile without errors
- Each sub-router file ≤200 LOC

---

## Plan 2 — Fix RAG SQL Injection _(1 hr)_

**File**: `apps/web/src/app/api/chat/stream/route.ts`

**Current problem**: Embedding vector is string-concatenated into raw SQL:

```typescript
const vectorStr = `[${embedding.join(",")}]`;
const results = await db.execute(sql.raw(`SELECT ... <=> '${vectorStr}'::vector LIMIT 5`));
```

**Fix**: Use Drizzle's parameterized `sql` template tag with proper casting:

```typescript
import { sql } from "drizzle-orm";

// embedding is number[] from Ollama — safe source but parameterize anyway
const vectorLiteral = sql`${JSON.stringify(embedding)}::vector`;

const results = await db.execute(sql`
  SELECT dc.id, dc.content, dc.metadata,
         dc.embedding <=> ${vectorLiteral} AS distance
  FROM document_chunks dc
  WHERE dc.knowledge_base_id = ${kbId}
  ORDER BY dc.embedding <=> ${vectorLiteral}
  LIMIT 5
`);
```

**Note**: Drizzle's `sql` tagged template parameterizes each `${...}` interpolation safely. The `::vector` cast requires the value to be a valid JSON array string — `JSON.stringify(embedding)` guarantees this.

### Acceptance

- `npm run typecheck` passes
- RAG still returns correct results in local test (send a message to an agent with a KB assigned)
- No `sql.raw(` calls remain in route.ts

---

## Plan 3 — MCP Server Management _(1–2 days)_

**Decisions**: DB storage (per-user rows), stdio + HTTP transports.

### Phase A: DB schema migration

Add to `apps/web/src/server/db/schema.ts`:

```typescript
export const mcpServers = pgTable("mcp_servers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  transport: text("transport").notNull(), // "stdio" | "http"
  // stdio only
  command: text("command"),
  args: text("args"), // JSON array string
  env: text("env"), // JSON object string
  // http only
  url: text("url"),
  // shared
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Run: `npm run db:generate && npm run db:push`

### Phase B: tRPC procedures

New file `apps/web/src/server/routers/mcp.ts`:

```typescript
export const mcpRouter = router({
  list:   protectedProcedure.query(...),          // list user's servers
  create: protectedProcedure.input(mcpServerSchema).mutation(...),
  update: protectedProcedure.input(...).mutation(...),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(...),
  test:   protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    // spawn MCPClient, call initialize, list tools, disconnect
    // return { ok: boolean, tools: string[], error?: string }
  }),
});
```

### Phase C: Wire MCPClient into AgentRuntime

In `apps/web/src/app/api/chat/stream/route.ts`, after loading agent config:

```typescript
// Load user's enabled MCP servers
const userMcpServers = await db.select().from(mcpServers)
  .where(and(eq(mcpServers.userId, session.user.id), eq(mcpServers.enabled, true)));

// Connect clients and collect tools
const mcpClients: MCPClient[] = [];
const mcpTools: Tool[] = [];
for (const server of userMcpServers) {
  const client = new MCPClient(server.transport === 'stdio'
    ? { type: 'stdio', command: server.command!, args: JSON.parse(server.args || '[]') }
    : { type: 'http', url: server.url! });
  try {
    await client.connect();
    const tools = await client.listTools();
    mcpTools.push(...tools);
    mcpClients.push(client);
  } catch (e) {
    console.error(`MCP server ${server.name} failed to connect:`, e);
  }
}

// Pass to runtime
const runtime = new AgentRuntime({ ..., extraTools: mcpTools });

// Cleanup after stream completes
stream.on('end', () => mcpClients.forEach(c => c.disconnect?.()));
```

### Phase D: UI — MCP Server Settings Panel

New component `apps/web/src/components/McpSettings.tsx`:

- Table: server name / transport / status / tool count / actions (edit, test, delete)
- "Add Server" form: name, transport selector (stdio/http), conditional fields
  - stdio: command (text), args (comma-separated), env vars (key-value pairs)
  - http: URL (text)
- "Test" button calls `mcp.test` — shows tool list or error inline
- Toggle enabled/disabled per server

Add "MCP Servers" section to existing Settings panel alongside "AI Providers".

### Acceptance

- User can add a stdio MCP server (e.g. `npx -y @modelcontextprotocol/server-filesystem /tmp`)
- Test button shows tool list
- Agent with an MCP server connected can call those tools during chat
- `npm run typecheck` passes

---

## Plan 4 — GitHub Copilot OAuth (Device Flow) _(2–3 days)_

**Client ID**: `Iv1.b507a08c87ecfe98` (public VS Code extension client ID — committed to `.env.example`)

### Phase A: Device flow API routes

**`apps/web/src/app/api/oauth/github-copilot/device/route.ts`**:

```typescript
export async function POST() {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });
  const data = await res.json();
  // Returns: { device_code, user_code, verification_uri, expires_in, interval }
  return Response.json(data);
}
```

**`apps/web/src/app/api/oauth/github-copilot/poll/route.ts`**:

```typescript
export async function POST(req: Request) {
  const { device_code } = await req.json();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_COPILOT_CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    // Save to providerCredentials via tRPC context or direct DB write
    // authType="oauth", providerId="github-copilot", accessToken=data.access_token
    // expiresAt = now + data.expires_in seconds (if provided)
    await saveGitHubCopilotCredential(data.access_token, session.user.id);
    return Response.json({ status: "authorized" });
  }
  // data.error === 'authorization_pending' | 'slow_down' | 'expired_token'
  return Response.json({ status: data.error });
}
```

### Phase B: Copilot AI provider

**`packages/ai-providers/src/providers/github-copilot.ts`**:

- Extend/wrap existing OpenAI provider with:
  - `baseUrl = 'https://api.githubcopilot.com'`
  - Headers: `Editor-Version: AgentHub/1.0`, `Copilot-Integration-Id: vscode-chat`
  - Auth: `Authorization: Bearer <accessToken>` (from `providerCredentials.accessToken`)
- Model list: `['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'o1', 'o3-mini']`
- Register in `registry.ts` when `authType === 'oauth'` credential exists for `github-copilot`

### Phase C: Token refresh

In `packages/ai-providers/src/registry.ts`, `loadUserCredentials()`:

```typescript
if (cred.authType === "oauth" && cred.expiresAt && cred.expiresAt < new Date()) {
  // Copilot uses short-lived tokens — re-auth via device flow (no refresh token)
  // Mark credential as expired, UI will show "Re-authorize" button
  await db.update(providerCredentials).set({ accessToken: null }).where(eq(providerCredentials.id, cred.id));
  continue; // skip registering this provider until re-authorized
}
```

### Phase D: UI

In `apps/web/src/components/ProviderSettings.tsx`, add GitHub Copilot card:

- State machine: `idle → initiating → awaiting_user → polling → authorized | error`
- `idle`: "Sign in with GitHub Copilot" button
- `initiating`: spinner, calls `/api/oauth/github-copilot/device`
- `awaiting_user`: shows `user_code` in large monospace + "Go to github.com/login/device" link, countdown timer
- `polling`: auto-polls `/api/oauth/github-copilot/poll` every `interval` seconds
- `authorized`: green checkmark, shows connected models, "Disconnect" button
- `error`: error message + retry

### Acceptance

- Full device flow works end-to-end in browser
- Copilot models appear in agent model selector after auth
- Expired token shows "Re-authorize" instead of crashing
- `npm run typecheck` passes

---

## Plan 5 — Gemini API Key UX Improvements _(2 hr)_

No new backend code. UI-only changes to `ProviderSettings.tsx`:

1. Add info banner below Gemini key input:

   > "Gemini Advanced does not include API access. Get a free key at aistudio.google.com."  
   > Link opens in new tab.

2. Same banner for Anthropic:

   > "Claude Max does not include API access. Get an API key at console.anthropic.com."

3. Same for OpenAI:

   > "ChatGPT Plus/Team does not include API access. Get an API key at platform.openai.com."

4. After a key is saved and tested successfully, fetch and display the model list dynamically:
   - Anthropic: `GET https://api.anthropic.com/v1/models` with `x-api-key` header
   - OpenAI: `GET https://api.openai.com/v1/models` with `Authorization: Bearer` header
   - Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}`
   - Store fetched models in component state, populate model selector from there instead of hardcoded list

---

## Plan 6 — Message Branching UI _(1 day)_

**Existing**: `parentId` column, `sessions.fork` tRPC mutation, fork button in `ChatInterface.tsx`  
**Missing**: Visual indicator of branches, branch navigation

### What to build

**Branch indicator in message list** (minimal, not a full tree):

- When a message has siblings (other messages with the same `parentId`), show a `◀ 1/3 ▶` navigator above it
- Clicking ◀/▶ switches which branch is displayed (fetches the sibling session via `sessions.list` filtered by `parentMessageId`)

**Implementation**:

1. Add tRPC query `sessions.listBranches`:

```typescript
listBranches: protectedProcedure
  .input(z.object({ parentMessageId: z.string() }))
  .query(async ({ ctx, input }) => {
    return db.select().from(chatSessions)
      .where(and(
        eq(chatSessions.userId, ctx.session.user.id),
        eq(chatSessions.parentMessageId, input.parentMessageId),
      ));
  }),
```

2. In `ChatInterface.tsx`, after the fork button click:
   - Show a `BranchNavigator` component at the fork point
   - It fetches `sessions.listBranches({ parentMessageId: msg.id })`
   - Displays `◀ Branch 1 of N ▶` — clicking switches `activeSessionId` in chatStore

3. In session list sidebar: show a branch icon (⑂) next to sessions that have a `parentMessageId`

### Acceptance

- Forking a conversation creates a visible branch indicator
- Navigating branches switches the message display
- Session list shows branch indicator for forked sessions

---

## Plan 7 — Memory Extraction After Every Response _(1 day)_

**Decision**: Extract after every assistant response, run in background.

### Phase A: Hook extraction into stream route

In `apps/web/src/app/api/chat/stream/route.ts`, after the assistant message is persisted:

```typescript
// Fire-and-forget — don't await, don't block the stream response
void (async () => {
  try {
    const recentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(6); // last 3 turns (user+assistant pairs)

    const extracted = await extractMemories(recentMessages, agent.id);
    if (extracted.length > 0) {
      await storePendingMemories(extracted, session.user.id, agent.id);
    }
  } catch (e) {
    console.error("Memory extraction failed (non-fatal):", e);
  }
})();
```

### Phase B: Memory review UI

Currently `MemoryEditor` view exists in chatStore but has no approve/reject UI.

In `apps/web/src/components/MemoryEditor.tsx`, add a "Pending" section:

- Fetch `memory.list({ status: 'proposed' })` on mount
- Each proposed memory shows: category / key / value / confidence badge
- Two buttons per entry: ✓ Accept → calls `memory.update({ id, status: 'accepted' })` / ✗ Reject → calls `memory.update({ id, status: 'rejected' })`
- Accepted memories move to "Active Memories" section
- Show count badge on "Memory" nav item when there are pending proposals

### Acceptance

- After a conversation, proposed memories appear in the Memory panel within ~5 seconds
- Accepting a memory causes it to be injected into the next session with that agent
- Rejecting removes it from the pending list
- Extraction failure does not affect chat — error logged, response still delivered

---

## Plan 8 — Dark Mode _(1–2 days)_

**Existing**: Tailwind config already has `darkMode: "class"`. Nothing else is wired.

### Phase A: Theme toggle

1. Add `theme: 'light' | 'dark' | 'system'` to Zustand chatStore, persisted to localStorage
2. On mount, apply/remove `dark` class on `<html>` based on preference + `prefers-color-scheme` media query
3. Add toggle button in sidebar footer: ☀ / ☾ / Auto

### Phase B: Audit and fix component colors

Systematic pass through all components — replace any hardcoded colors with Tailwind semantic pairs:

| Current (hardcoded)         | Replace with                                   |
| --------------------------- | ---------------------------------------------- |
| `bg-white`                  | `bg-white dark:bg-gray-900`                    |
| `bg-gray-50`                | `bg-gray-50 dark:bg-gray-800`                  |
| `text-gray-900`             | `text-gray-900 dark:text-gray-100`             |
| `border-gray-200`           | `border-gray-200 dark:border-gray-700`         |
| `bg-blue-600` (primary CTA) | stays same (sufficient contrast in both modes) |

Files to audit: `ChatInterface.tsx`, `AgentBuilder.tsx`, `ProviderSettings.tsx`, `GroupBuilder.tsx`, `MemoryEditor.tsx`, `layout.tsx`, `page.tsx`

### Phase C: System preference sync

```typescript
// In layout.tsx or _app equivalent
useEffect(() => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  if (theme === "system") {
    document.documentElement.classList.toggle("dark", media.matches);
  }
  const handler = (e: MediaQueryListEvent) => {
    if (theme === "system") document.documentElement.classList.toggle("dark", e.matches);
  };
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}, [theme]);
```

### Acceptance

- Toggle switches mode, persists across page reload
- All panels readable in both modes (no white-on-white or black-on-black)
- System mode follows OS preference and responds to changes

---

## Plan 9 — Dynamic Model List _(1 day)_

**Current**: Models hardcoded in `ProviderSettings.tsx` per provider (4 models each).

### Per-provider fetch endpoints

| Provider       | Endpoint                                                                   | Auth                                                    |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| OpenAI         | `GET https://api.openai.com/v1/models`                                     | `Authorization: Bearer {apiKey}`                        |
| Anthropic      | `GET https://api.anthropic.com/v1/models`                                  | `x-api-key: {apiKey}` + `anthropic-version: 2023-06-01` |
| Gemini         | `GET https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}` | query param                                             |
| Ollama         | `GET {baseUrl}/api/tags`                                                   | none                                                    |
| LM Studio      | `GET {baseUrl}/v1/models`                                                  | none                                                    |
| GitHub Copilot | hardcoded list (no public /models endpoint)                                | n/a                                                     |

### Implementation

New tRPC procedure in `providers.ts` sub-router:

```typescript
fetchModels: protectedProcedure
  .input(z.object({ credentialId: z.string() }))
  .query(async ({ ctx, input }) => {
    const cred = await getCredential(input.credentialId, ctx.session.user.id);
    const models = await fetchModelsForProvider(cred);
    return models; // string[]
  }),
```

`fetchModelsForProvider(cred)` is a new server-side function in `packages/ai-providers/src/` — keep provider-specific fetch logic co-located with each provider file.

In `ProviderSettings.tsx`:

- After saving a credential, automatically call `providers.fetchModels`
- Cache result in component state
- Model selector populates from fetched list; falls back to hardcoded list on error

### Acceptance

- Saving an OpenAI key immediately populates a current model list (includes gpt-4.1, o3, etc.)
- Ollama model selector shows locally available models
- Fetch error shows fallback list with warning toast

---

## Plan 10 — Agent Export Button _(2 hr)_

**Existing**: `createAgentExportManifest()` in `marketplace.ts` — fully implemented, not exposed in UI.

### Change

In `apps/web/src/components/AgentBuilder.tsx`, add an "Export" button in the agent header/toolbar:

```typescript
const exportAgent = trpc.marketplace.export.useQuery(
  { agentId: selectedAgent?.id ?? "" },
  { enabled: false }, // only fetch on demand
);

// Button onClick:
const handleExport = async () => {
  const { data } = await exportAgent.refetch();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${selectedAgent?.name ?? "agent"}-manifest.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

Add `marketplace.export` tRPC query (currently only `marketplace.import` and `marketplace.list` exist):

```typescript
export: protectedProcedure
  .input(z.object({ agentId: z.string() }))
  .query(async ({ ctx, input }) => {
    const agent = await getAgentForUser(input.agentId, ctx.session.user.id);
    return createAgentExportManifest(agent);
  }),
```

### Acceptance

- Export button appears in AgentBuilder for any saved agent
- Clicking downloads a `.json` file conforming to `manifestSchema` (schemaVersion: "agenthub.marketplace.v1")
- Downloaded file can be re-imported via the marketplace import flow

---

## Execution Order

| #   | Plan                       | Est.     | Blocks                  |
| --- | -------------------------- | -------- | ----------------------- |
| 0   | `.env.example`             | 30 min   | CI                      |
| 1   | Split `_app.ts`            | 2–4 hr   | All future backend work |
| 2   | Fix RAG SQL injection      | 1 hr     | Security                |
| 5   | Gemini/Anthropic/OpenAI UX | 2 hr     | User clarity            |
| 10  | Agent export button        | 2 hr     | Quick win               |
| 9   | Dynamic model list         | 1 day    | Better UX               |
| 7   | Memory extraction          | 1 day    | Core feature            |
| 6   | Message branching UI       | 1 day    | Core feature            |
| 4   | GitHub Copilot OAuth       | 2–3 days | Subscription use        |
| 3   | MCP management             | 1–2 days | Power feature           |
| 8   | Dark mode                  | 1–2 days | Polish                  |
