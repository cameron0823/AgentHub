# AgentHub — Concrete Implementation Plans

> Generated: 2026-05-12 · Based on FEATURE_TRACKER.md + FEATURE_CATALOG.md
> All phases build on Plans 0–10 (already committed).
> Meta-skills listed per phase; spawn before implementation, not after.
> **Status note (2026-05-15):** Detailed execution playbook for completed Phases 11-32. `TODO.md` is the canonical current tracker; Future/Tier 3 work remains design-first backlog.

---

## Phase 11 — Blocking Fixes + Foundation

**Effort:** ~5h | **Priority:** SHIP-BLOCKING

### 11.1 Create `.env.example` (30 min)

**Why:** `tests/repository.test.mjs` asserts this file exists — CI fails without it.

**Files:**

- `CREATE /.env.example`

**Exact content:**

```
# Database
DATABASE_URL=postgresql://agenthub:agenthub@localhost:5432/agenthub

# Auth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-at-least-32-chars

# Casdoor OIDC
CASDOOR_ENDPOINT=http://localhost:8000
CASDOOR_CLIENT_ID=
CASDOOR_CLIENT_SECRET=
CASDOOR_APP_NAME=app-agenthub
CASDOOR_ORG_NAME=built-in

# MinIO / S3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=agenthub

# Redis (optional — unused until Phase 28)
REDIS_URL=redis://localhost:6379

# Ollama (local embedding)
OLLAMA_BASE_URL=http://localhost:11434
```

**Acceptance:** `npm test` passes the repository suite.

---

### 11.2 Fix RAG SQL Injection (1h)

**Why:** `sql.raw(vectorStr)` in stream route is exploitable if embedding vectors are externally sourced.  
**Meta-skill:** spawn `security-auditor` before touching the file.

**File:** `apps/web/src/app/api/chat/stream/route.ts`

**Find:**

```ts
const vectorStr = `[${embedding.join(",")}]`;
// query using sql.raw(vectorStr)
```

**Replace with parameterized approach using Drizzle's `sql` template tag:**

```ts
import { sql } from "drizzle-orm";
// Build typed vector literal — numbers only, validated before use
const safeVector = embedding.map(Number).filter(isFinite);
const chunks = await db.execute(
  sql`SELECT id, content, document_id, 1 - (embedding <=> ${JSON.stringify(safeVector)}::vector) AS similarity
      FROM document_chunks
      WHERE knowledge_base_id = ${kbId}
      ORDER BY embedding <=> ${JSON.stringify(safeVector)}::vector
      LIMIT 5`,
);
```

**Note:** Drizzle's `sql` template tag parameterizes interpolated values — `${JSON.stringify(safeVector)}` becomes `$1` in the wire protocol. Confirm by checking `EXPLAIN` output shows `$1`.

**Acceptance:** `npm run typecheck` clean; `security-auditor` finds no remaining `sql.raw` on user/embedding-derived input.

---

### 11.3 Split `_app.ts` into Sub-Routers (2–4h)

**Why:** 906-line file violates 200 LOC rule; blocks parallel development.

**Current:** `apps/web/src/server/routers/_app.ts` — all procedures in one file.

**Target structure:**

```
apps/web/src/server/routers/
  _app.ts              ← index only: mergeRouters() calls, no business logic
  auth.ts              ← session/user procedures
  agents.ts            ← agents + groups (already partially split)
  sessions.ts          ← chat sessions + fork
  messages.ts          ← message CRUD + deleteAfter
  memory.ts            ← memoryEntries CRUD
  knowledgeBases.ts    ← KB + documents + chunks
  marketplace.ts       ← importPack + exportAgent (already exists)
  providers.ts         ← providerCredentials + providers catalog (already split)
  files.ts             ← presigned upload
```

**Subtasks:**

1. For each domain, extract procedures to their own file, export a `domainRouter`.
2. In `_app.ts`, replace inline procedure definitions with `import { domainRouter } from "./domain"` and add to `mergeRouters`.
3. Verify tRPC client types still resolve: `npm run typecheck` — the `AppRouter` type must be identical.

**Acceptance:** `_app.ts` < 50 lines; all 3 packages typecheck clean; tests pass.

---

## Phase 12 — Markdown Rendering + Dark Mode

**Effort:** 1–2 days | **Priority:** HIGH (core chat quality)

### 12.1 Full Markdown with Syntax Highlighting (4h)

**Meta-skill:** `supply-chain-guardian` before adding packages.

**New packages:**

```bash
pnpm add react-markdown remark-gfm rehype-highlight highlight.js
# in apps/web
```

**Files:**

- `CREATE apps/web/src/components/MessageMarkdown.tsx`
- `MODIFY apps/web/src/components/ChatMessage.tsx` — replace plain text render with `<MessageMarkdown>`

**`MessageMarkdown.tsx` implementation:**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export function MessageMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ node, inline, className, children, ...props }) {
          return inline ? (
            <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm" {...props}>
              {children}
            </code>
          ) : (
            <div className="relative group">
              <CopyButton content={String(children)} />
              <code className={`${className} block overflow-x-auto rounded-lg p-4 text-sm`} {...props}>
                {children}
              </code>
            </div>
          );
        },
        // tables, blockquotes, etc. get Tailwind classes
      }}
    />
  );
}
```

**Subtasks:**

1. `MessageMarkdown` with copy-code button (`CopyButton` component).
2. Import `highlight.js` CSS in `layout.tsx` or via CSS import at component level.
3. Ensure code blocks render language label (parse from className `language-*`).
4. Test with a code-heavy assistant message end-to-end.

---

### 12.2 LaTeX / Math Rendering (1h)

**New packages:** `remark-math`, `rehype-katex`, `katex/dist/katex.min.css`

Add to `MessageMarkdown.tsx` remark/rehype plugin chains. No separate component needed.

---

### 12.3 Dark Mode (4h)

**File:** `apps/web/src/app/layout.tsx`, `apps/web/src/components/ThemeToggle.tsx`

**Approach:** Tailwind `darkMode: "class"` + localStorage persistence.

**Subtasks:**

1. Confirm `tailwind.config.ts` has `darkMode: "class"`. If missing, add it.
2. `CREATE apps/web/src/components/ThemeToggle.tsx`:
   ```tsx
   "use client";
   import { useEffect, useState } from "react";
   import { Moon, Sun } from "lucide-react";
   export function ThemeToggle() {
     const [dark, setDark] = useState(false);
     useEffect(() => {
       const saved = localStorage.getItem("theme");
       const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
       setDark(saved === "dark" || (!saved && prefersDark));
     }, []);
     useEffect(() => {
       document.documentElement.classList.toggle("dark", dark);
       localStorage.setItem("theme", dark ? "dark" : "light");
     }, [dark]);
     return (
       <button onClick={() => setDark((d) => !d)} className="p-2 rounded-lg hover:bg-muted">
         {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
       </button>
     );
   }
   ```
3. Add `ThemeToggle` to sidebar footer or settings header.
4. Audit all hardcoded color classes — replace with `bg-background`, `text-foreground`, `border` (CSS variable based). The existing components already use Tailwind semantic classes so this should be minimal.

**Acceptance:** Toggle persists across reload; no white flash on dark-mode startup (add `suppressHydrationWarning` to `<html>`).

---

## Phase 13 — Memory System Completion

**Effort:** 1 day | **Priority:** HIGH

### 13.1 Wire Memory Extraction (2h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

**Current:** `extractMemories()` in `memory.ts` is never called.

**After last SSE chunk is flushed, fire-and-forget:**

```ts
// After: controller.close()
void (async () => {
  try {
    await extractMemories(userId, sessionId, fullAssistantResponse);
  } catch {
    /* non-fatal */
  }
})();
```

**`extractMemories` signature** (verify in `apps/web/src/server/memory.ts`):

- Takes userId, sessionId, and the full assembled assistant response text.
- Calls LLM with extraction prompt, inserts proposed entries with `status: "proposed"`.

**Subtasks:**

1. Assemble `fullAssistantResponse` string from streamed chunks (accumulate in a local variable before closing).
2. Call `extractMemories` fire-and-forget.
3. Verify: after a conversation containing "my name is Alex", a `memoryEntries` row with status `"proposed"` appears.

---

### 13.2 Memory Approve/Reject UI (3h)

**File:** `apps/web/src/components/MemoryPanel.tsx` (CREATE or modify existing MemoryEditor)

**Check existing:** Look for `MemoryEditor` in chatStore — if it exists, extend it. Otherwise create.

**Required UI elements:**

- Tab: "Proposed" | "Accepted" | "Rejected"
- Per-entry: content text, agent name, timestamp, "Accept" / "Reject" buttons
- Accept button calls `trpc.memory.update.mutate({ id, status: "accepted" })`
- Reject button calls `trpc.memory.update.mutate({ id, status: "rejected" })`
- Optimistic update in local list

**tRPC:** `memory.update` procedure should already exist (FEATURE_TRACKER: ✅). Confirm input schema includes `status`.

**Acceptance:** Proposed memories from extraction appear in panel; accepting one causes it to appear in `fetchAcceptedMemoriesForAgent()` context injection.

---

### 13.3 Memory Search UI (2h)

**Add to MemoryPanel:**

- Search input → debounced tRPC call to `memory.search({ query, agentId? })`
- **tRPC:** `CREATE memory.search` procedure in `memory.ts` router:
  ```ts
  search: authedProcedure
    .input(z.object({ query: z.string().min(1), agentId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(memoryEntries)
        .where(and(
          eq(memoryEntries.userId, ctx.user.id),
          eq(memoryEntries.status, "accepted"),
          input.agentId ? eq(memoryEntries.agentId, input.agentId) : undefined,
          ilike(memoryEntries.content, `%${input.query}%`)
        ))
        .limit(20);
    }),
  ```
- Render results as a list with highlight of matching term.

---

## Phase 14 — MCP Integration

**Effort:** 1–2 days | **Priority:** HIGH  
**Meta-skill:** `security-auditor` before implementing stdio transport (command injection risk).

### 14.1 Schema: MCP Servers Table (30 min)

**File:** `apps/web/src/server/db/schema.ts`

```ts
export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  transport: varchar("transport", { length: 10 }).notNull().default("stdio"), // "stdio" | "http"
  command: text("command"), // e.g. "npx @modelcontextprotocol/server-filesystem /tmp"
  url: text("url"), // for HTTP transport
  envVars: jsonb("env_vars").default({}),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Run migration: `pnpm --filter @agenthub/web drizzle-kit generate && drizzle-kit migrate`.

---

### 14.2 tRPC Router: MCP Servers (2h)

**File:** `CREATE apps/web/src/server/routers/mcpServers.ts`

**Procedures:**

```
mcpServers.list     → SELECT WHERE userId
mcpServers.create   → INSERT; validate transport fields
mcpServers.update   → UPDATE WHERE id + userId
mcpServers.delete   → DELETE WHERE id + userId
mcpServers.test     → instantiate MCPClient, call listTools(), return tool names or error
mcpServers.discover → call listTools(), return full tool schemas
```

**Security note for `create`/`update`:** The `command` field must NOT allow shell metacharacters. Validate: `if (/[;&|`$<>]/.test(command)) throw new TRPCError({ code: "BAD_REQUEST" })`. This is a whitelist concern — spawn with `execFile`not`exec`(already the case in`MCPClient`).

**Wire into `_app.ts`:**

```ts
import { mcpServersRouter } from "./routers/mcpServers";
// mergeRouters: mcpServers: mcpServersRouter
```

---

### 14.3 Connect MCPClient to Runtime (1h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

**After loading agent, before calling `runtime.run()`:**

```ts
const userMcpServers = await db.select().from(mcpServers)
  .where(and(eq(mcpServers.userId, userId), eq(mcpServers.isEnabled, true)));

const mcpTools: ToolDefinition[] = [];
for (const server of userMcpServers) {
  try {
    const client = new MCPClient({ transport: server.transport as "stdio" | "http", command: server.command ?? undefined, url: server.url ?? undefined });
    await client.connect();
    const tools = await client.listTools();
    mcpTools.push(...tools);
    // Store clients for cleanup after stream
  } catch { /* skip unavailable servers */ }
}

// Pass to runtime via ExtraTool pattern (already implemented)
const result = runtime.run({ ..., extraTools: mcpTools });
```

---

### 14.4 MCP Settings UI (3h)

**File:** `CREATE apps/web/src/components/MCPServerManager.tsx`

**UI elements:**

- List existing servers (name, transport, enabled toggle, delete)
- "Add Server" form: name, transport selector (stdio/http), command OR url, env vars (key-value pairs)
- "Test Connection" button → calls `mcpServers.test` → shows discovered tools or error
- Pre-configured templates: filesystem, postgres, github (show as quick-add cards)

**Add tab to Settings panel** (wherever ProviderSettings is rendered).

---

## Phase 15 — Chat UX Completions

**Effort:** 2 days | **Priority:** HIGH

### 15.1 Chain-of-Thought (CoT) Collapsible Panel (2h)

**Context:** Ollama parses `<think>...</think>` tags from reasoning models into a separate content type. The data is there; the UI isn't.

**File:** `apps/web/src/components/ChatMessage.tsx`

**Detect reasoning content:**

```tsx
// In message render, check for thinking chunks
const thinkingContent = message.thinkingContent; // or parse from raw stream chunks
if (thinkingContent) {
  <details className="mb-2 text-sm text-muted-foreground">
    <summary className="cursor-pointer select-none">Reasoning ({wordCount} words)</summary>
    <div className="mt-2 p-3 rounded bg-muted/50 whitespace-pre-wrap font-mono text-xs">{thinkingContent}</div>
  </details>;
}
```

**Stream route:** When assembling message content, capture `<think>` content separately. Store in `messages.metadata` JSONB as `{ thinkingContent: string }`.

**Subtasks:**

1. In stream route: detect `<think>` tag content, strip from main response, store in metadata.
2. In `ChatMessage`: read `message.metadata?.thinkingContent`, render collapsible `<details>`.
3. Verify with Ollama DeepSeek-R1 or similar reasoning model.

---

### 15.2 Mermaid Diagram Rendering (1h)

**Package:** `pnpm add mermaid` (apps/web)

**File:** `apps/web/src/components/MessageMarkdown.tsx`

**In the `code` component handler:**

```tsx
if (className === "language-mermaid") {
  return <MermaidBlock code={String(children)} />;
}
```

**`CREATE apps/web/src/components/MermaidBlock.tsx`:**

```tsx
"use client";
import { useEffect, useRef } from "react";
import mermaid from "mermaid";
export function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    mermaid.render(`mermaid-${Date.now()}`, code).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    });
  }, [code]);
  return <div ref={ref} className="my-4 flex justify-center" />;
}
```

---

### 15.3 Message Edit UI (2h)

**Context:** Edit button should replace message content and re-trigger stream from that point.

**File:** `apps/web/src/components/ChatMessage.tsx`

**Subtasks:**

1. Add edit state: `const [editing, setEditing] = useState(false); const [editText, setEditText] = useState(message.content)`.
2. On hover, show pencil icon button (only for user messages).
3. In edit mode, show textarea with Save/Cancel buttons.
4. On Save:
   - Call `trpc.messages.update.mutate({ id: message.id, content: editText })`
   - Call `trpc.messages.deleteAfter.mutate({ id: message.id })` to remove subsequent messages
   - Re-trigger chat stream from this edited message
5. **tRPC:** Add `messages.update` procedure: `UPDATE messages SET content=$1 WHERE id=$2 AND session_id IN (SELECT id FROM sessions WHERE user_id=$3)`.

---

### 15.4 Export Conversation as Markdown (1h)

**File:** `apps/web/src/components/ChatHeader.tsx` (or wherever the ⋯ menu lives)

**Add "Export as Markdown" menu item:**

```ts
function exportAsMarkdown(messages: Message[], sessionTitle: string) {
  const md = messages.map((m) => `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}`).join("\n\n---\n\n");
  const blob = new Blob([`# ${sessionTitle}\n\n${md}`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sessionTitle.replace(/\s+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```

No tRPC needed — pure client-side from Zustand store messages.

---

### 15.5 Copy Message Button + Timestamp Toggle (1h)

**Copy button:** Already handled by code block copy. Add a per-message "Copy full message" button (icon only, on hover) using `navigator.clipboard.writeText(message.content)`.

**Timestamp toggle:** Add to settings store (Zustand). When enabled, show `<time>` element below each message. Format: `"MMM D, h:mm a"` via `date-fns` (already likely a dep, or `new Date().toLocaleString()`).

---

## Phase 16 — Message Branching UI

**Effort:** 1 day | **Priority:** MEDIUM

**Context:** `parentId` column + `sessions.fork` tRPC procedure exist. The branching data model works; only the UI is missing.

### 16.1 Fork Session from Message (2h)

**File:** `apps/web/src/components/ChatMessage.tsx`

**Add "Fork from here" button** (on user messages, below edit/copy icons):

```ts
const fork = trpc.sessions.fork.useMutation({
  onSuccess: (newSession) => {
    addSession(newSession);
    setActiveSession(newSession.id);
  },
});
// Button: onClick={() => fork.mutate({ sessionId, messageId: message.id })}
```

---

### 16.2 Branch Indicator in Session List (2h)

**File:** `apps/web/src/components/SessionList.tsx`

**If a session has `parentSessionId`, show a visual indent and branch icon:**

```tsx
<div className={cn("flex items-center gap-1", session.parentSessionId && "ml-4")}>
  {session.parentSessionId && <GitBranch className="h-3 w-3 text-muted-foreground" />}
  <span>{session.title || "Untitled"}</span>
</div>
```

**tRPC:** Ensure `sessions.list` returns `parentSessionId` field.

---

## Phase 17 — Prompt Library + Slash Commands

**Effort:** 1–2 days | **Priority:** MEDIUM (Tier 1 catalog item)

### 17.1 Schema (30 min)

```ts
export const promptLibrary = pgTable("prompt_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().default([]),
  isPinned: boolean("is_pinned").default(false),
  useCount: integer("use_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 17.2 tRPC Router (1h)

**File:** `CREATE apps/web/src/server/routers/promptLibrary.ts`

Procedures: `list` (with tag filter), `create`, `update`, `delete`, `incrementUse`.

### 17.3 Slash Command in Chat Input (2h)

**File:** `apps/web/src/components/ChatInput.tsx`

**Trigger:** When user types `/` at start of input:

1. Open a popover above input showing matching prompts (filtered as user types after `/`).
2. Arrow keys to navigate, Enter to insert.
3. Inserting replaces the `/<query>` with full prompt content.

**Implementation:**

- Track `slashQuery` when input starts with `/`.
- `trpc.promptLibrary.list.useQuery({ search: slashQuery }, { enabled: !!slashQuery })`.
- Render `<SlashCommandPopover>` anchored to input.

### 17.4 Prompt Library UI (2h)

**File:** `CREATE apps/web/src/components/PromptLibraryManager.tsx`

- Full CRUD: create/edit/delete prompts.
- Tag filter chips.
- Pin/unpin.
- "Use in chat" button → navigates to chat + inserts prompt.
- Add as a tab in Settings or as a sidebar item.

---

## Phase 18 — Shareable Chat Links

**Effort:** 3–4h | **Priority:** MEDIUM

### 18.1 Schema (15 min)

```ts
// Add to sessions table:
isPublic: boolean("is_public").default(false),
publicSlug: varchar("public_slug", { length: 20 }).unique(),
```

### 18.2 tRPC: Publish Session (30 min)

```ts
publish: authedProcedure
  .input(z.object({ sessionId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const slug = nanoid(10);
    await db.update(sessions)
      .set({ isPublic: true, publicSlug: slug })
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, ctx.user.id)));
    return { slug };
  }),
```

### 18.3 Public View Route (2h)

**File:** `CREATE apps/web/src/app/share/[slug]/page.tsx`

- `publicProcedure` (no auth) fetches messages by slug.
- Read-only chat view — no input, no sidebar.
- Show agent avatar/name if agent-scoped.
- "Fork this conversation" button → requires login.

### 18.4 Share Button in Chat (30 min)

**File:** `apps/web/src/components/ChatHeader.tsx`

Share icon → calls `publish` mutation → shows copy-link toast with `${window.location.origin}/share/${slug}`.

---

## Phase 19 — File Attachment in Chat

**Effort:** 1–2 days | **Priority:** MEDIUM

### 19.1 Chat Input File Picker (2h)

**File:** `apps/web/src/components/ChatInput.tsx`

**Add paperclip button:**

```tsx
<input ref={fileRef} type="file" className="hidden" onChange={handleFileAttach} accept="image/*,.pdf,.txt,.md,.csv" />
<button onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></button>
```

**On file select:**

1. POST to `/api/upload/presigned` (existing endpoint).
2. PUT to presigned URL.
3. Store `{ fileId, url, name, mimeType }` in local state.
4. Display attachment chip above input with remove button.

### 19.2 Send Attachment with Message (1h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

Accept `fileIds?: string[]` in request body. For each file:

- If `image/*`: fetch from MinIO, base64 encode, inject as vision content block in LLM message.
- If `text/*` or `.md`/`.csv`: fetch content, prepend as context block in system prompt: `[Attached file: {name}]\n{content}`.

### 19.3 Attachment Display in Messages (1h)

**File:** `apps/web/src/components/ChatMessage.tsx`

If `message.metadata?.attachments` exists:

- Images: `<img src={url} className="max-w-sm rounded-lg mt-2" />`.
- Files: file chip with name + download link.

---

## Phase 20 — Agent Enhancements

**Effort:** 1 day | **Priority:** MEDIUM

### 20.1 Opening Messages + Starter Questions (2h)

**Schema:**

```ts
// Add to agents table:
openingMessage: text("opening_message"),
openingQuestions: jsonb("opening_questions").default([]),
```

**tRPC:** `agents.create` and `agents.update` accept `openingMessage` and `openingQuestions`.

**UI — Agent Builder** (`AgentBuilder.tsx`):

- Textarea: "Opening message (shown when chat starts)".
- Dynamic list: "Starter questions" (add/remove rows).

**UI — Chat** (`apps/web/src/components/ChatView.tsx` or similar):

- If session has no messages and agent has `openingMessage`, show it as a welcome bubble.
- Show question chips below; clicking sends the question as a user message.

### 20.2 KB Picker in Agent Builder (1h)

**Context:** `agents.knowledgeBaseId` FK exists; FEATURE_TRACKER shows "🔶 no KB picker in AgentBuilder".

Check `AgentBuilder.tsx` — the `KBSelector` component is already implemented and rendered. Verify it's wired to `form.knowledgeBaseId` → confirm in the existing file (it is — line 271-274).

**This may already be done** — run the app and confirm KB picker appears and saves correctly. If yes, mark as complete; no code change needed.

---

## Phase 21 — RAG Inline Citations

**Effort:** 3–4h | **Priority:** MEDIUM

### 21.1 Emit RAG Sources in SSE Stream (1h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

After retrieving chunks (before injecting into context):

```ts
controller.enqueue(
  encoder.encode(
    `data: ${JSON.stringify({ type: "rag_sources", sources: chunks.map((c) => ({ id: c.id, documentId: c.documentId, content: c.content.slice(0, 200), similarity: c.similarity })) })}\n\n`,
  ),
);
```

### 21.2 Store Sources on Message (30 min)

Store `ragSources` in `messages.metadata` JSONB alongside `thinkingContent`.

### 21.3 Sources Panel in ChatMessage (2h)

**File:** `apps/web/src/components/ChatMessage.tsx`

```tsx
{
  message.metadata?.ragSources?.length > 0 && (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Sources ({message.metadata.ragSources.length})</summary>
      <div className="mt-2 space-y-2">
        {message.metadata.ragSources.map((s) => (
          <div key={s.id} className="p-2 rounded border bg-muted/30">
            <div className="text-xs font-medium">{s.documentName}</div>
            <div className="text-xs text-muted-foreground">{(s.similarity * 100).toFixed(1)}% match</div>
            <p className="text-xs mt-1 line-clamp-2">{s.content}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
```

---

## Phase 22 — Conversation Search

**Effort:** 1 day | **Priority:** MEDIUM

### 22.1 tRPC Procedure (1h)

**File:** `apps/web/src/server/routers/messages.ts`

```ts
search: authedProcedure
  .input(z.object({ query: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    return db.select({
      messageId: messages.id,
      sessionId: messages.sessionId,
      sessionTitle: sessions.title,
      content: messages.content,
      createdAt: messages.createdAt,
      role: messages.role,
    })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .where(and(
      eq(sessions.userId, ctx.user.id),
      ilike(messages.content, `%${input.query}%`)
    ))
    .orderBy(desc(messages.createdAt))
    .limit(30);
  }),
```

### 22.2 Search UI (3h)

**File:** `CREATE apps/web/src/components/SearchModal.tsx`

- `Cmd+K` / `Ctrl+K` keyboard shortcut opens modal.
- Input with real-time search (300ms debounce).
- Results grouped by session.
- Click result → navigate to session + scroll to message (use `message.id` as anchor).
- Highlight matching term in excerpt.

**Add keyboard shortcut handler** to root layout or `ChatLayout`:

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen(true);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

---

## Phase 23 — Mobile Responsive + Keyboard Shortcuts

**Effort:** 1–2 days | **Priority:** MEDIUM

### 23.1 Mobile Layout (4h)

**File:** `apps/web/src/app/page.tsx` and sidebar component

**Pattern:** Sidebar as drawer on mobile.

**Subtasks:**

1. Sidebar: `hidden md:flex` by default; overlay drawer (`fixed inset-0 z-50`) when toggled.
2. Hamburger button in chat header (mobile only): `<button className="md:hidden">`.
3. Chat input: ensure it doesn't shift behind mobile keyboard — use `min-h-0` and `flex-col` layout.
4. Message list: verify scroll behavior on iOS Safari (add `-webkit-overflow-scrolling: touch`).
5. Agent selector: full-screen bottom sheet on mobile.

### 23.2 Keyboard Shortcuts (2h)

**File:** `CREATE apps/web/src/components/KeyboardShortcuts.tsx` (global handler)

| Shortcut         | Action                    |
| ---------------- | ------------------------- |
| `Cmd/Ctrl+K`     | Open search (Phase 22)    |
| `Cmd/Ctrl+N`     | New conversation          |
| `Escape`         | Close open panel/modal    |
| `Cmd/Ctrl+Enter` | Send message              |
| `Cmd/Ctrl+/`     | Show shortcuts help modal |

Add `<KeyboardShortcuts />` to root layout — registers `useEffect` listeners, dispatches to chatStore.

---

## Phase 24 — Token Count Display

**Effort:** 2–3h | **Priority:** LOW (but fast)

### 24.1 Count Tokens Before Send (1h)

**File:** `apps/web/src/components/ChatInput.tsx`

Use a simple approximation (no API call): `Math.ceil(text.length / 4)` tokens.

Show below input: `~{count} tokens`. Style: `text-xs text-muted-foreground`.

Color thresholds: `< 2k → green`, `2k-8k → yellow`, `> 8k → red`.

### 24.2 Track Tokens Used Per Message (1h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

After stream completes, if provider returns `usage` object (OpenAI/Anthropic do), write to `messages.tokensUsed`. Then surfaces in Analytics (Phase 26).

---

## Phase 25 — Web Search Tool (SearXNG)

**Effort:** 3–4 days | **Priority:** MEDIUM

### 25.1 Infrastructure (1h)

Add SearXNG to `docker-compose.yml`:

```yaml
searxng:
  image: searxng/searxng:latest
  environment:
    - SEARXNG_BASE_URL=http://searxng:8080
  ports: ["8080:8080"]
```

Add `SEARXNG_BASE_URL=http://localhost:8080` to `.env.example`.

### 25.2 Web Search Tool Implementation (3h)

**File:** `CREATE packages/agent-runtime/src/tools/webSearch.ts`

```ts
export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web for current information. Returns top 5 results with titles, URLs, and snippets.",
  inputSchema: z.object({ query: z.string().describe("Search query") }),
  execute: async ({ query }) => {
    const url = new URL(`${process.env.SEARXNG_BASE_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`SearXNG error: ${res.status}`);
    const data = (await res.json()) as { results: { title: string; url: string; content: string }[] };
    return data.results.slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  },
};
```

Register in `packages/agent-runtime/src/tools/registry.ts`.

### 25.3 Agent Tool Toggle (30 min)

**File:** `apps/web/src/components/AgentBuilder.tsx`

Add `web_search` to `TOOL_OPTIONS`:

```ts
{ id: "web_search", label: "Web Search", description: "Search the internet via SearXNG for current information." },
```

### 25.4 Citation Rendering for Search Results (1h)

When `web_search` returns results, the tool_result chunk should render as expandable cards showing title + URL + snippet. Extend `ToolCallCard` component.

---

## Phase 26 — Analytics Dashboard

**Effort:** 3–4 days | **Priority:** LOW

### 26.1 Populate Metrics in Stream Route (1h)

Ensure `messages.tokensUsed` and `sessions.latencyMs` are written. `latencyMs` = time from first chunk to last chunk.

### 26.2 tRPC Analytics Procedures (2h)

**File:** `CREATE apps/web/src/server/routers/analytics.ts`

```ts
summary: authedProcedure.query(async ({ ctx }) => {
  // total sessions, total messages, total tokens, most-used agent
}),
messagesPerDay: authedProcedure
  .input(z.object({ days: z.number().default(30) }))
  .query(async ({ ctx, input }) => {
    // GROUP BY date_trunc('day', created_at)
}),
tokensByAgent: authedProcedure.query(async ({ ctx }) => {
  // SUM(tokens_used) GROUP BY agent_id
}),
```

### 26.3 Analytics UI (4h)

**File:** `CREATE apps/web/src/components/AnalyticsDashboard.tsx`

**Package:** `pnpm add recharts` (apps/web)

**Components:**

- Summary cards: Total chats / Messages / Tokens this week / Favorite agent
- `<LineChart>` for messages per day (last 30 days)
- `<BarChart>` for tokens by agent
- `<PieChart>` for message role distribution (user vs assistant)

Add `/analytics` route: `apps/web/src/app/analytics/page.tsx`.

---

## Phase 27 — Voice Input/Output (STT + TTS)

**Effort:** 2–3 days | **Priority:** LOW

### 27.1 STT via Browser Web Speech API (2h)

**File:** `CREATE apps/web/src/components/VoiceInput.tsx`

```tsx
"use client";
import { useState, useRef } from "react";
export function VoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const toggle = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      alert("Browser speech recognition not supported");
      return;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => onTranscript(e.results[0][0].transcript);
    r.onend = () => setRecording(false);
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  };
  return (
    <button onClick={toggle} className={recording ? "text-red-500 animate-pulse" : ""}>
      <Mic className="h-4 w-4" />
    </button>
  );
}
```

Add to `ChatInput.tsx` next to send button.

### 27.2 TTS via Browser SpeechSynthesis (2h)

**File:** `CREATE apps/web/src/components/TTSButton.tsx`

Per-message play button. On click: `window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.content))`. Show pause icon while speaking.

**Global toggle** in settings: "Auto-read responses" — auto-speaks each new assistant message.

---

## Phase 28 — Scheduled Automations

**Effort:** 4–5 days | **Priority:** LOW

### 28.1 Schema (30 min)

```ts
export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  agentId: uuid("agent_id").references(() => agents.id),
  prompt: text("prompt").notNull(),
  cronExpression: varchar("cron_expression", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationId: uuid("automation_id").references(() => automations.id),
  status: varchar("status", { length: 20 }).default("pending"),
  output: text("output"),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});
```

### 28.2 BullMQ Worker (2h)

**File:** `CREATE apps/web/src/server/workers/automation.ts`

Wire Redis (finally used). Use `bullmq` for job queue:

- On schedule: enqueue job `{ automationId }`.
- Worker: fetch automation + agent → call `AgentRuntime.run()` with stored prompt → store output in `automationRuns`.
- Use `node-cron` to scan `automations WHERE nextRunAt <= now()` and enqueue.

### 28.3 Automations tRPC + UI (2h)

CRUD procedures + `apps/web/src/components/AutomationsManager.tsx`:

- List automations with last run status + next run time.
- Create form: prompt textarea, cron expression (with human-readable preview), agent selector.
- Run history table.

---

## Phase 29 — Prompt Variables / Substitution

**Effort:** 2h | **Priority:** LOW

**File:** `CREATE apps/web/src/server/prompt-variables.ts`

```ts
export function substituteVariables(text: string, ctx: { userName?: string; date: Date; agentName?: string }): string {
  return text
    .replace(/\{\{USER_NAME\}\}/g, ctx.userName ?? "User")
    .replace(/\{\{CURRENT_DATE\}\}/g, ctx.date.toLocaleDateString())
    .replace(/\{\{CURRENT_TIME\}\}/g, ctx.date.toLocaleTimeString())
    .replace(/\{\{AGENT_NAME\}\}/g, ctx.agentName ?? "Assistant");
}
```

**Wire in stream route:** Call `substituteVariables(agent.systemPrompt, { ... })` before passing system prompt to runtime.

**Agent Builder:** Add note under system prompt: "Supports variables: `{{USER_NAME}}`, `{{CURRENT_DATE}}`, `{{AGENT_NAME}}`".

---

## Phase 30 — Code Interpreter Sandbox (Light)

**Effort:** 3–4 days | **Priority:** LOW (requires Docker in prod)

### 30.1 Docker Sandbox API (1 day)

**File:** `CREATE apps/web/src/server/sandbox.ts`

Executes Python code in a Docker container with limits:

```ts
export async function executePython(code: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Use Dockerode or child_process exec:
  // docker run --rm --network none --memory 256m --cpus 0.5 --timeout 30
  //   python:3.11-slim python -c "<code>"
  // Capture stdout/stderr
}
```

**Security:** `--network none`, `--read-only`, `--tmpfs /tmp:size=50m`, `--memory 256m`, `--cpus 0.5`.

### 30.2 execute_code Tool (1h)

**File:** `packages/agent-runtime/src/tools/executeCode.ts`

```ts
export const executeCodeTool: ToolDefinition = {
  name: "execute_code",
  description: "Execute Python code and return output. Use for calculations, data analysis, and visualizations.",
  inputSchema: z.object({ code: z.string(), language: z.enum(["python"]).default("python") }),
  execute: async ({ code }) => executePython(code),
};
```

### 30.3 UI Rendering (1h)

Extend `ToolCallCard` to handle `execute_code` results:

- Show code in syntax-highlighted block.
- Show stdout/stderr in output panel.
- If output contains base64 PNG (matplotlib), render as `<img>`.

---

## Phase 31 — Agent Orchestration UI

**Effort:** 1–2 days | **Priority:** LOW

**Context:** Sequential, Parallel, Supervisor, Debate, GroupChat orchestrators are all implemented in `packages/agent-runtime/src/orchestrators/`. The `GroupBuilder.tsx` component exists but the link between group config and orchestration mode is unclear.

### 31.1 Orchestration Mode Selector (2h)

**File:** `apps/web/src/components/GroupBuilder.tsx`

Add "Orchestration Mode" selector:

```tsx
<select value={form.orchestrationMode} onChange={...}>
  <option value="sequential">Sequential — agents run in order, each sees prior output</option>
  <option value="parallel">Parallel — all agents run simultaneously, results merged</option>
  <option value="supervisor">Supervisor — one agent orchestrates others</option>
  <option value="debate">Debate — agents argue positions, moderator synthesizes</option>
  <option value="groupchat">Group Chat — conversational multi-agent session</option>
</select>
```

### 31.2 Wire Orchestration Mode to Runtime (1h)

**File:** `apps/web/src/app/api/chat/stream/route.ts`

When session has an `agentGroupId`, fetch group config including `orchestrationMode`. Dispatch to the matching orchestrator instead of single-agent runtime.

---

## Phase 32 — Integration Test Coverage (Cross-Cutting)

**Effort:** 2–3 days | **Priority:** HIGH (quality gate for all above)  
**Meta-skill:** spawn `code-reviewer` for test plan; `security-auditor` for auth/injection test cases.

### 32.1 Auth + Session Tests (1h)

**File:** `apps/web/src/__tests__/auth.test.ts`

- Sign in with mock NextAuth session.
- Verify `authedProcedure` rejects unauthenticated calls (expect `UNAUTHORIZED`).
- Verify session data is isolated per user.

### 32.2 Chat Stream Tests (2h)

**File:** `apps/web/src/__tests__/chat-stream.test.ts`

- Mock `AgentRuntime.run()` → verify SSE chunks are emitted correctly.
- Verify messages are persisted to DB.
- Verify memory extraction is triggered after stream.
- Verify RAG injection uses parameterized queries (no `sql.raw`).

### 32.3 Agent CRUD Tests (1h)

**File:** `apps/web/src/__tests__/agents.test.ts`

- Create agent → verify stored.
- Update agent → verify fields updated.
- Delete agent → verify cascade.
- Verify user isolation: user A cannot read user B's agents.

### 32.4 KB + RAG Tests (1h)

**File:** `apps/web/src/__tests__/knowledgeBase.test.ts`

- Upload document → verify chunks created.
- Query KB → verify similarity results returned.
- Verify RAG injection into system prompt format.

### 32.5 MCP Security Tests (1h)

**File:** `packages/agent-runtime/src/__tests__/mcp-security.test.ts`

- Verify command with shell metacharacters is rejected by validator.
- Verify stdio MCPClient uses `execFile` not `exec`.

---

## Test Commands (Run After Each Phase)

```bash
cd /home/coxar/projects/AgentHub

# Type safety
npm run typecheck

# All tests
npm test

# Focused suite
cd apps/web && pnpm test -- --testPathPattern=<phase-pattern>
```

---

## Meta-Skills by Phase

| Phase               | Meta-Skills                                                        |
| ------------------- | ------------------------------------------------------------------ |
| 11.2 (RAG security) | `security-auditor` before + after                                  |
| 11.3 (router split) | `code-reviewer` after                                              |
| 12 (packages)       | `supply-chain-guardian` before adding deps                         |
| 14 (MCP)            | `security-auditor` (command injection); `code-reviewer` after      |
| 22.2 (search)       | `code-reviewer` (SQL ilike injection — use parameterized)          |
| 25 (web search)     | `supply-chain-guardian`; `security-auditor` (SSRF via SearXNG URL) |
| 28 (automations)    | `security-auditor` (cron expression injection, BullMQ job auth)    |
| 30 (sandbox)        | `security-auditor` (Docker escape, code injection)                 |
| 32 (tests)          | `code-reviewer` for test plan                                      |

---

## Tier 3 Overview (Weeks+, No Subtasks — Plan Only)

| Feature             | Est. Effort | Key Decision                                                           |
| ------------------- | ----------- | ---------------------------------------------------------------------- |
| A2UI Declarative UI | 3–4 weeks   | JSON schema design is critical path — do schema first, renderer second |
| Full Code Sandbox   | 4–6 weeks   | Persistent containers per user require billing/limits design first     |
| CRDT Local-First    | 4–5 weeks   | Yjs + IndexedDB; migration path from PostgreSQL is the risk            |
| Agent Task System   | 3–4 weeks   | Dependency graph resolution; retry/failure handling is the hard part   |

**Recommendation:** Don't start Tier 3 until Phase 32 (test coverage) is complete. Tier 3 requires a stable foundation.

---

## Acceptance Criteria (Every Phase)

1. `npm run typecheck` exits 0 (all 3 packages).
2. `npm test` exits 0 (no regressions from prior tests).
3. `code-reviewer` agent finds no blocking issues in the diff.
4. For security phases: `security-auditor` gives explicit clearance.
5. Feature works end-to-end in the browser (start dev server, exercise the golden path).
