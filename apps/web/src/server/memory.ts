import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "./db";
import { memoryEntries } from "./db/schema";
import { validateProviderBaseUrl } from "./security/outbound";

const MAX_MEMORY_ENTRIES = 12;
const MAX_MEMORY_VALUE_LENGTH = 280;

export async function fetchAcceptedMemoriesForAgent(agentId: string, userId: string) {
  return db
    .select()
    .from(memoryEntries)
    .where(
      and(
        eq(memoryEntries.userId, userId),
        eq(memoryEntries.status, "accepted"),
        or(isNull(memoryEntries.agentId), eq(memoryEntries.agentId, agentId)),
      ),
    )
    .orderBy(desc(memoryEntries.updatedAt))
    .limit(MAX_MEMORY_ENTRIES);
}

export function formatMemoryBlock(entries: Array<{ category: string; key: string; value: string }>) {
  const lines = entries.slice(0, MAX_MEMORY_ENTRIES).map((entry) => {
    const value =
      entry.value.length > MAX_MEMORY_VALUE_LENGTH
        ? `${entry.value.slice(0, MAX_MEMORY_VALUE_LENGTH - 1)}...`
        : entry.value;
    return `- [${entry.category}] ${entry.key}: ${value}`;
  });

  if (lines.length === 0) return "";
  return ["Relevant saved memories:", ...lines].join("\n");
}

export function appendMemoryBlockToSystemPrompt(
  systemPrompt: string | null | undefined,
  memoryBlock: string,
): string | undefined {
  if (!memoryBlock) return systemPrompt || undefined;
  return [systemPrompt || "", memoryBlock].filter(Boolean).join("\n\n");
}

interface ExtractedMemory {
  category: string;
  key: string;
  value: string;
}

export async function extractMemories(
  userMessage: string,
  assistantResponse: string,
  model = "ollama:qwen2.5:7b",
): Promise<ExtractedMemory[]> {
  const ollamaUrl = validateProviderBaseUrl(process.env.OLLAMA_URL, "http://localhost:11434");
  const modelName = model.replace("ollama:", "");

  const prompt = `You are a memory extraction system. Given a user message and an assistant response, extract 0-3 factual memories about the user that would be useful in future conversations.

Rules:
- Only extract concrete, factual information about the user (preferences, facts, goals, context).
- Do not extract generic information or temporary details.
- If no useful memories can be extracted, output "NONE".

Format each memory exactly as:
CATEGORY: <profile|preference|fact|goal>
KEY: <short descriptive label>
VALUE: <detailed fact>

---

User: ${userMessage.slice(0, 2000)}

Assistant: ${assistantResponse.slice(0, 2000)}

Extracted memories:`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 300 },
      }),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { response?: string };
    const text = data.response?.trim() || "";

    if (text.toUpperCase().includes("NONE")) return [];

    const memories: ExtractedMemory[] = [];
    const blocks = text.split(/CATEGORY:\s*/i).slice(1);

    for (const block of blocks) {
      const categoryMatch = block.match(/^(.+?)\s*\n/i);
      const keyMatch = block.match(/KEY:\s*(.+?)\s*\n/i);
      const valueMatch = block.match(/VALUE:\s*([\s\S]+?)(?:\nCATEGORY:|$)/i);

      if (categoryMatch && keyMatch && valueMatch) {
        memories.push({
          category: categoryMatch[1].trim().toLowerCase(),
          key: keyMatch[1].trim(),
          value: valueMatch[1].trim(),
        });
      }
    }

    return memories.slice(0, 3);
  } catch {
    return [];
  }
}

async function embedText(text: string): Promise<number[] | null> {
  try {
    const ollamaUrl = validateProviderBaseUrl(process.env.OLLAMA_URL, "http://localhost:11434");
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const emb = data.embedding;
    if (!Array.isArray(emb) || !emb.every((v) => typeof v === "number" && isFinite(v))) return null;
    return emb as number[];
  } catch {
    return null;
  }
}

export async function storePendingMemories(
  agentId: string,
  userId: string,
  memories: ExtractedMemory[],
  sourceMessageId?: string,
) {
  for (const mem of memories) {
    const embeddingText = `${mem.key}: ${mem.value}`;
    const embedding = await embedText(embeddingText);
    await db.insert(memoryEntries).values({
      userId,
      agentId,
      category: mem.category,
      key: mem.key,
      value: mem.value,
      confidence: 0.7,
      sourceMessageId: sourceMessageId || null,
      status: "proposed",
      isEdited: false,
      embedding: embedding,
    });
  }
}
