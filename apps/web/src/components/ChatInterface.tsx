"use client";

import { useEffect, useRef, useCallback } from "react";
import { useChatStore, ChatMessage } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";
import { ChatMessageItem } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { v4 as uuidv4 } from "uuid";

export function ChatInterface() {
  const {
    sessions,
    activeSessionId,
    isGenerating,
    selectedModel,
    addMessage,
    updateMessage,
    setIsGenerating,
    setSelectedModel,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const utils = trpc.useUtils();
  const createMessage = trpc.messages.create.useMutation({
    onSuccess: () => utils.messages.list.invalidate(),
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeSessionId) return;

      const userMsgId = uuidv4();
      const userMessage: ChatMessage = {
        id: userMsgId,
        role: "user",
        content,
      };

      addMessage(activeSessionId, userMessage);
      await createMessage.mutateAsync({
        sessionId: activeSessionId,
        role: "user",
        content,
      });

      const assistantMsgId = uuidv4();
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
        model: selectedModel,
      };

      addMessage(activeSessionId, assistantMessage);
      setIsGenerating(true);

      const sessionMessages = [
        ...(activeSession?.messages || []),
        userMessage,
      ].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId,
            model: selectedModel,
            messages: sessionMessages,
          }),
          signal: abortRef.current.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let fullReasoning = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (!data.trim()) continue;

            try {
              const chunk = JSON.parse(data);

              if (chunk.type === "content" && chunk.content) {
                fullContent += chunk.content;
                updateMessage(activeSessionId, assistantMsgId, {
                  content: fullContent,
                });
              }

              if (chunk.type === "reasoning" && chunk.content) {
                fullReasoning += chunk.content;
                updateMessage(activeSessionId, assistantMsgId, {
                  reasoning: fullReasoning,
                });
              }

              if (chunk.type === "done") {
                updateMessage(activeSessionId, assistantMsgId, {
                  isStreaming: false,
                });
              }

              if (chunk.type === "error") {
                updateMessage(activeSessionId, assistantMsgId, {
                  content: `Error: ${chunk.error}`,
                  isStreaming: false,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          updateMessage(activeSessionId, assistantMsgId, {
            content: `Error: ${(err as Error).message}`,
            isStreaming: false,
          });
        }
      } finally {
        setIsGenerating(false);
        updateMessage(activeSessionId, assistantMsgId, {
          isStreaming: false,
        });
      }
    },
    [activeSessionId, activeSession, selectedModel, addMessage, updateMessage, setIsGenerating, createMessage]
  );

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to AgentHub</h2>
          <p className="text-sm">Start a new conversation to chat with your local AI.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {activeSession.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">New Conversation</h2>
              <p className="text-sm">Send a message to start chatting with {selectedModel}.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {activeSession.messages.map((msg) => (
              <ChatMessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <div className="max-w-3xl mx-auto flex items-center gap-2 mb-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs bg-muted rounded px-2 py-1 border outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="qwen2.5:7b">qwen2.5:7b</option>
            <option value="qwen2.5:14b">qwen2.5:14b</option>
            <option value="llama3.2:3b">llama3.2:3b</option>
            <option value="deepseek-r1:14b">deepseek-r1:14b</option>
            <option value="phi4:14b">phi4:14b</option>
          </select>
        </div>
        <ChatInput onSend={handleSend} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
