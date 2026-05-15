import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { agents, chatSessions, messages as messagesTable, memoryEntries } from "@/server/db/schema";

export const runtime = "nodejs";
export const config = { api: { bodyParser: false } };

// ZIP STORE parser — reads only STORE-method (no compression) entries
function parseZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let pos = 0;

  while (pos < buf.length - 4) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== 0x04034b50) break; // local file header

    const flags = buf.readUInt16LE(pos + 6);
    const method = buf.readUInt16LE(pos + 8);
    const compressedSize = buf.readUInt32LE(pos + 18);
    const uncompressedSize = buf.readUInt32LE(pos + 22);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const name = buf.subarray(pos + 30, pos + 30 + nameLen).toString("utf8");

    if (method !== 0) {
      // Only STORE is supported — skip compressed entries
      pos += 30 + nameLen + extraLen + compressedSize;
      continue;
    }

    const dataStart = pos + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + uncompressedSize);
    files.set(name, Buffer.from(data));

    pos = dataStart + compressedSize;
    // Skip data descriptor if present (bit 3 of flags)
    if (flags & 0x08) pos += 16;
  }

  return files;
}

function randomUUID(): string {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/octet-stream") && !contentType.includes("application/zip")) {
    return NextResponse.json({ error: "Expected multipart/form-data or application/zip body" }, { status: 400 });
  }

  const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

  let zipBuf: Buffer;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Missing file field in form data" }, { status: 400 });
      }
      if ((file as File).size > MAX_IMPORT_SIZE) {
        return NextResponse.json({ error: "Import file exceeds 50 MB limit" }, { status: 413 });
      }
      zipBuf = Buffer.from(await (file as File).arrayBuffer());
    } else {
      const contentLength = Number(req.headers.get("content-length") ?? 0);
      if (contentLength > MAX_IMPORT_SIZE) {
        return NextResponse.json({ error: "Import file exceeds 50 MB limit" }, { status: 413 });
      }
      zipBuf = Buffer.from(await req.arrayBuffer());
      if (zipBuf.length > MAX_IMPORT_SIZE) {
        return NextResponse.json({ error: "Import file exceeds 50 MB limit" }, { status: 413 });
      }
    }
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // Validate ZIP signature
  if (zipBuf.length < 4 || zipBuf.readUInt32LE(0) !== 0x04034b50) {
    return NextResponse.json({ error: "Invalid ZIP file" }, { status: 400 });
  }

  const zipEntries = parseZip(zipBuf);

  const stats = { agents: 0, sessions: 0, messages: 0, memories: 0, errors: [] as string[] };

  // ── Import agents ────────────────────────────────────────────────────────────
  const agentIdMap = new Map<string, string>(); // old → new

  const agentsRaw = zipEntries.get("agents.json");
  if (agentsRaw) {
    let parsed: unknown[];
    try { parsed = JSON.parse(agentsRaw.toString("utf8")); } catch { parsed = []; }

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const oldId = String(r.id ?? "");
      const newId = randomUUID();
      agentIdMap.set(oldId, newId);

      try {
        await db.insert(agents).values({
          id: newId,
          userId,
          name: String(r.name ?? "Imported Agent"),
          description: r.description ? String(r.description) : null,
          avatar: r.avatar ? String(r.avatar) : null,
          systemPrompt: String(r.systemPrompt ?? ""),
          model: String(r.model ?? "ollama:qwen2.5:7b"),
          temperature: typeof r.temperature === "number" ? r.temperature : 0.7,
          maxTokens: typeof r.maxTokens === "number" ? r.maxTokens : 4096,
          tools: typeof r.tools === "string" ? r.tools : "[]",
          memoryEnabled: Boolean(r.memoryEnabled ?? true),
          knowledgeBaseId: null, // KB not included in export — omit reference
          tags: typeof r.tags === "string" ? r.tags : "[]",
          isPublic: false, // imported agents are private by default
          openingMessage: r.openingMessage ? String(r.openingMessage) : null,
          openingQuestions: Array.isArray(r.openingQuestions) ? r.openingQuestions : [],
        });
        stats.agents++;
      } catch (err) {
        stats.errors.push(`agent ${oldId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Import sessions + messages ────────────────────────────────────────────────
  const sessionsRaw = zipEntries.get("sessions.jsonl");
  if (sessionsRaw) {
    const lines = sessionsRaw.toString("utf8").split("\n").filter(Boolean);
    const sessionIdMap = new Map<string, string>(); // old → new

    for (const line of lines) {
      let s: Record<string, unknown>;
      try { s = JSON.parse(line); } catch { continue; }

      const oldSessionId = String(s.id ?? "");
      const newSessionId = randomUUID();
      sessionIdMap.set(oldSessionId, newSessionId);

      const mappedAgentId = s.agentId ? agentIdMap.get(String(s.agentId)) ?? null : null;

      try {
        await db.insert(chatSessions).values({
          id: newSessionId,
          userId,
          agentId: mappedAgentId,
          groupId: null, // groups not included in export
          title: String(s.title ?? "Imported Chat"),
          model: String(s.model ?? "ollama:qwen2.5:7b"),
          metadata: typeof s.metadata === "object" && s.metadata !== null ? s.metadata as Record<string, unknown> : {},
          isPublic: false,
          publicSlug: null, // don't preserve slugs — avoid collisions
          isPinned: false,
        });
        stats.sessions++;
      } catch (err) {
        stats.errors.push(`session ${oldSessionId}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      // Import messages for this session
      const msgs = Array.isArray(s.messages) ? s.messages : [];
      const msgIdMap = new Map<string, string>();

      for (const m of msgs) {
        if (!m || typeof m !== "object") continue;
        const mr = m as Record<string, unknown>;
        const oldMsgId = String(mr.id ?? "");
        const newMsgId = randomUUID();
        msgIdMap.set(oldMsgId, newMsgId);

        const role = String(mr.role ?? "user");
        if (!["user", "assistant", "system", "tool"].includes(role)) continue;

        const mappedParentId = mr.parentId ? msgIdMap.get(String(mr.parentId)) ?? null : null;

        try {
          await db.insert(messagesTable).values({
            id: newMsgId,
            sessionId: newSessionId,
            parentId: mappedParentId,
            role: role as "user" | "assistant" | "system" | "tool",
            content: String(mr.content ?? ""),
            reasoning: mr.reasoning ? String(mr.reasoning) : null,
            model: mr.model ? String(mr.model) : null,
            toolCalls: mr.toolCalls ?? null,
            artifacts: mr.artifacts ?? null,
            metadata: mr.metadata ?? null,
            tokensUsed: typeof mr.tokensUsed === "number" ? mr.tokensUsed : null,
            latencyMs: typeof mr.latencyMs === "number" ? mr.latencyMs : null,
            feedback: null, // don't import feedback
          });
          stats.messages++;
        } catch (err) {
          stats.errors.push(`message ${oldMsgId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // ── Import memory entries ─────────────────────────────────────────────────────
  const memoryRaw = zipEntries.get("memory.json");
  if (memoryRaw) {
    let parsed: unknown[];
    try { parsed = JSON.parse(memoryRaw.toString("utf8")); } catch { parsed = []; }

    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;

      const mappedAgentId = r.agentId ? agentIdMap.get(String(r.agentId)) ?? null : null;
      const status = String(r.status ?? "accepted");
      const validStatus = ["accepted", "proposed", "rejected", "archived"].includes(status) ? status : "accepted";

      try {
        await db.insert(memoryEntries).values({
          id: randomUUID(),
          userId,
          agentId: mappedAgentId,
          category: String(r.category ?? "general"),
          key: String(r.key ?? ""),
          value: String(r.value ?? ""),
          confidence: typeof r.confidence === "number" ? r.confidence : 1,
          sourceMessageId: null, // source messages have new IDs; omit link to avoid stale refs
          status: validStatus as "accepted" | "proposed" | "rejected" | "archived",
          isEdited: Boolean(r.isEdited ?? false),
          embedding: null, // embeddings will be regenerated on next memory search
        });
        stats.memories++;
      } catch (err) {
        stats.errors.push(`memory: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    imported: stats,
    ...(stats.errors.length > 0 && { warnings: stats.errors.slice(0, 20) }),
  });
}
