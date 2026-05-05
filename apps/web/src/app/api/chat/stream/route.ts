import { NextRequest } from "next/server";
import { providerRegistry } from "@agenthub/ai-providers";
import { db } from "@/server/db";
import { messages } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { sessionId, model, messages: chatMessages, temperature, maxTokens } = await req.json();

  const provider = providerRegistry.get("ollama");
  if (!provider) {
    return new Response(JSON.stringify({ error: "Ollama provider not available" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let fullReasoning = "";

      try {
        for await (const chunk of provider.streamChat({
          model,
          messages: chatMessages,
          temperature,
          maxTokens,
          stream: true,
        })) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));

          if (chunk.type === "content" && chunk.content) {
            fullContent += chunk.content;
          }
          if (chunk.type === "reasoning" && chunk.content) {
            fullReasoning += chunk.content;
          }
        }

        // Persist assistant message
        const msgId = uuidv4();
        await db.insert(messages).values({
          id: msgId,
          sessionId,
          role: "assistant",
          content: fullContent,
          reasoning: fullReasoning || null,
          model,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "persisted", messageId: msgId })}\n\n`));
        controller.close();
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
