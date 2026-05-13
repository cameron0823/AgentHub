"use client";

import { useEffect, useRef, useCallback } from "react";
import { Download, Share2, Menu } from "lucide-react";
import { useChatStore, ChatMessage } from "@/stores/chatStore";
import { trpc } from "@/lib/trpc";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { VirtualizedMessageList } from "./VirtualizedMessageList";
import { generateSessionTitle, shouldAutoTitle } from "@/lib/title";
import { BranchNavigator } from "./BranchNavigator";

function exportAsMarkdown(messages: ChatMessage[], title: string) {
  const body = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `## ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}`)
    .join("\n\n---\n\n");
  const blob = new Blob([`# ${title}\n\n${body}`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseToolCalls(value: unknown): ChatMessage["toolCalls"] {
  return parseJsonArray(value) as ChatMessage["toolCalls"];
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function ChatInterface() {
  const {
    sessions,
    activeSessionId,
    isGenerating,
    selectedModel,
    agents,
    agentGroups,
    addMessage,
    updateMessage,
    replaceMessageId,
    setSessionMessages,
    setIsGenerating,
    setSidebarOpen,
  } = useChatStore();

  const abortRef = useRef<AbortController | null>(null);

  const utils = trpc.useUtils();
  const createMessage = trpc.messages.create.useMutation({
    onSuccess: () => utils.messages.list.invalidate(),
  });
  const updateServerMessage = trpc.messages.update.useMutation({
    onSuccess: () => utils.messages.list.invalidate(),
  });
  const deleteServerMessage = trpc.messages.delete.useMutation({
    onSuccess: () => utils.messages.list.invalidate(),
  });
  const deleteMessagesAfter = trpc.messages.deleteAfter.useMutation({
    onSuccess: () => utils.messages.list.invalidate(),
  });
  const updateServerSession = trpc.sessions.update.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });
  const forkSession = trpc.sessions.fork.useMutation({
    onSuccess: (newSession) => {
      utils.sessions.list.invalidate();
      useChatStore.getState().addSession({
        id: newSession.id,
        title: newSession.title || "New Chat",
        model: newSession.model || "ollama:qwen2.5:7b",
        agentId: newSession.agentId,
        groupId: newSession.groupId,
        parentMessageId: newSession.parentMessageId,
        messages: [],
        createdAt: new Date(newSession.createdAt),
        updatedAt: new Date(newSession.updatedAt),
      });
      useChatStore.getState().setActiveSession(newSession.id);
    },
  });
  const publishSession = trpc.sessions.publish.useMutation({
    onSuccess: ({ slug }) => {
      const url = `${window.location.origin}/share/${slug}`;
      void navigator.clipboard.writeText(url).catch(() => {});
      alert(`Share link copied to clipboard:\n${url}`);
      utils.sessions.list.invalidate();
    },
  });
  const messageList = trpc.messages.list.useQuery(
    { sessionId: activeSessionId || "" },
    { enabled: Boolean(activeSessionId) }
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeAgent = activeSession?.agentId ? agents.find((agent) => agent.id === activeSession.agentId) : undefined;
  const activeGroup = activeSession?.groupId ? agentGroups.find((group) => group.id === activeSession.groupId) : undefined;

  useEffect(() => {
    if (!activeSessionId || !messageList.data) return;
    setSessionMessages(
      activeSessionId,
      messageList.data.map((message) => {
        const toolCalls = parseToolCalls(message.toolCalls);
        const toolCall = toolCalls?.[0];

        return {
          id: message.id,
          role: message.role,
          content: message.content,
          reasoning: message.reasoning || undefined,
          toolCalls,
          toolCallId: message.role === "tool" ? toolCall?.id : undefined,
          toolName: message.role === "tool" ? toolCall?.function.name : undefined,
          toolResult: message.role === "tool" ? {
            toolCallId: toolCall?.id,
            toolName: toolCall?.function.name || "tool",
            result: parseJsonValue(message.content),
          } : undefined,
          model: message.model || undefined,
          createdAt: message.createdAt || undefined,
          tokensUsed: message.tokensUsed ?? null,
          latencyMs: message.latencyMs ?? null,
        };
      })
    );
  }, [activeSessionId, messageList.data, setSessionMessages]);

  const handleSend = useCallback(
    async (content: string, fileAttachments?: { url: string; name: string; type: string }[]) => {
      if (!activeSessionId) return;

      const imageAttachments = fileAttachments?.filter((a) => a.type.startsWith("image/")) ?? [];
      const fileOnlyAttachments = fileAttachments?.filter((a) => !a.type.startsWith("image/")) ?? [];
      const attachmentText = fileOnlyAttachments.length
        ? `\n\n[Attached files: ${fileOnlyAttachments.map((a) => `[${a.name}](${a.url})`).join(", ")}]`
        : "";
      const textContent = content + attachmentText;

      // Build multipart content when images are present
      type ContentPart = { type: "text"; text: string } | { type: "image_url"; url: string };
      const messageContent: string | ContentPart[] = imageAttachments.length > 0
        ? [
            { type: "text" as const, text: textContent },
            ...imageAttachments.map((a) => ({ type: "image_url" as const, url: a.url })),
          ]
        : textContent;

      const userMsgId = crypto.randomUUID();
      const userMessage: ChatMessage = {
        id: userMsgId,
        role: "user",
        content: typeof messageContent === "string" ? messageContent : textContent,
      };

      addMessage(activeSessionId, userMessage);
      if (shouldAutoTitle(activeSession?.title)) {
        const title = generateSessionTitle(content);
        if (title !== activeSession?.title) {
          useChatStore.getState().updateSession(activeSessionId, { title, updatedAt: new Date() });
          updateServerSession.mutate({ id: activeSessionId, title });
        }
      }

      if (!activeGroup) {
        await createMessage.mutateAsync({
          id: userMsgId,
          sessionId: activeSessionId,
          role: "user",
          content,
        });
      }

      const assistantMsgId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
        model: activeAgent?.model || selectedModel,
      };

      addMessage(activeSessionId, assistantMessage);
      setIsGenerating(true);

      // Read fresh messages from store to avoid stale closure after edit/regenerate
      const freshSession = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
      const sessionMessages = [
        ...(freshSession?.messages || []),
        // Override the last user message with the full content parts (including images)
        { ...userMessage, content: messageContent },
      ].map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls,
        tool_call_id: m.toolCallId,
        name: m.toolName,
      }));

      abortRef.current = new AbortController();

      try {
        const res = await fetch(activeGroup ? "/api/groups/stream" : "/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(activeGroup ? {
            groupId: activeGroup.id,
            sessionId: activeSessionId,
            task: content,
          } : {
            sessionId: activeSessionId,
            model: activeAgent?.model || selectedModel,
            messages: sessionMessages,
            tools: activeAgent?.tools,
          }),
          signal: abortRef.current.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let fullReasoning = "";
        const toolCalls: NonNullable<ChatMessage["toolCalls"]> = [];

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

              if (chunk.type === "agent_output" && chunk.chunk?.type === "content" && chunk.chunk.content) {
                fullContent += chunk.chunk.content;
                updateMessage(activeSessionId, assistantMsgId, {
                  content: fullContent,
                });
              }

              if (chunk.type === "group_complete" && chunk.synthesis) {
                fullContent = chunk.synthesis;
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

              if (chunk.type === "tool_call" && chunk.toolCall) {
                toolCalls.push(chunk.toolCall);
                updateMessage(activeSessionId, assistantMsgId, {
                  toolCalls: [...toolCalls],
                });
              }

              if (chunk.type === "tool_result") {
                const toolResult = {
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  result: chunk.result,
                };
                addMessage(activeSessionId, {
                  id: crypto.randomUUID(),
                  role: "tool",
                  content: typeof chunk.result === "string" ? chunk.result : JSON.stringify(chunk.result),
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  toolResult,
                });
              }

              if (chunk.type === "rag_sources" && chunk.sources) {
                updateMessage(activeSessionId, assistantMsgId, {
                  ragSources: chunk.sources,
                });
              }

              if (chunk.type === "done") {
                updateMessage(activeSessionId, assistantMsgId, {
                  isStreaming: false,
                  tokensUsed: (chunk as { tokensUsed?: number }).tokensUsed ?? null,
                  latencyMs: (chunk as { latencyMs?: number }).latencyMs ?? null,
                });
              }

              if (chunk.type === "persisted" && chunk.messageId) {
                replaceMessageId(activeSessionId, assistantMsgId, chunk.messageId);
                utils.messages.list.invalidate({ sessionId: activeSessionId });
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
    [activeSessionId, activeSession, activeAgent, activeGroup, selectedModel, addMessage, updateMessage, replaceMessageId, setIsGenerating, createMessage, updateServerSession, utils.messages.list]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    if (!activeSessionId) return;

    const streamingAssistant = activeSession?.messages.find(
      (message) => message.role === "assistant" && message.isStreaming
    );
    if (streamingAssistant) {
      updateMessage(activeSessionId, streamingAssistant.id, { isStreaming: false });
    }
  }, [activeSessionId, activeSession, setIsGenerating, updateMessage]);

  const handleBranch = useCallback((messageId: string) => {
    if (!activeSessionId) return;
    forkSession.mutate({ id: activeSessionId, messageId });
  }, [activeSessionId, forkSession]);

  const handleEdit = useCallback(async (messageId: string, newContent: string) => {
    if (!activeSessionId) return;

    // Update the message on server
    await updateServerMessage.mutateAsync({ id: messageId, content: newContent });

    // Delete all messages after this one on server
    await deleteMessagesAfter.mutateAsync({ sessionId: activeSessionId, messageId });

    // Update local state
    updateMessage(activeSessionId, messageId, { content: newContent });
    const freshSession = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
    const msgIndex = freshSession?.messages.findIndex((m) => m.id === messageId);
    if (msgIndex !== undefined && msgIndex >= 0 && freshSession) {
      const messagesToKeep = freshSession.messages.slice(0, msgIndex + 1);
      useChatStore.getState().setSessionMessages(activeSessionId, messagesToKeep);
    }

    // Regenerate response
    await handleSend(newContent);
  }, [activeSessionId, updateMessage, updateServerMessage, deleteMessagesAfter, handleSend]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!activeSessionId) return;

    const freshSession = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
    if (!freshSession) return;

    // Find the user message that prompted this assistant message
    const msgIndex = freshSession.messages.findIndex((m) => m.id === messageId);
    if (msgIndex <= 0) return;

    const userMessage = freshSession.messages[msgIndex - 1];
    if (userMessage.role !== "user") return;

    // Delete the assistant message on server
    await deleteServerMessage.mutateAsync({ id: messageId });

    // Delete locally
    const messagesToKeep = freshSession.messages.slice(0, msgIndex);
    useChatStore.getState().setSessionMessages(activeSessionId, messagesToKeep);

    // Regenerate
    await handleSend(userMessage.content);
  }, [activeSessionId, deleteServerMessage, handleSend]);

  const handleFeedback = useCallback((_messageId: string, _feedback: "up" | "down") => {
    // Feedback stored locally only for now — Phase 19 wires to backend
  }, []);

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
      <div className="flex-1 min-h-0">
        {activeSession.parentMessageId && (
          <BranchNavigator
            parentMessageId={activeSession.parentMessageId}
            activeSessionId={activeSession.id}
            onSwitch={(sessionId) => useChatStore.getState().setActiveSession(sessionId)}
          />
        )}
        {activeSession.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg px-4">
              {(activeAgent as any)?.openingMessage ? (
                <>
                  <div className="rounded-xl bg-muted/50 border px-5 py-4 text-sm text-left mb-4">
                    {(activeAgent as any).openingMessage}
                  </div>
                  {((activeAgent as any).openingQuestions as string[] | undefined)?.length ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      {((activeAgent as any).openingQuestions as string[]).map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q)}
                          className="px-3 py-1.5 rounded-full border text-sm hover:bg-muted transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-muted-foreground">
                  <h2 className="text-xl font-semibold mb-2">New Conversation</h2>
                  <p className="text-sm">Send a message to start chatting with {activeGroup?.name || activeAgent?.name || selectedModel}.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <VirtualizedMessageList
            messages={activeSession.messages}
            onBranch={handleBranch}
            onEdit={handleEdit}
            onRegenerate={handleRegenerate}
            onFeedback={handleFeedback}
          />
        )}
      </div>

      <div className="border-t p-2">
        <div className="max-w-3xl mx-auto flex items-center gap-2 mb-2">
          <button
            className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
          {activeGroup ? (
            <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              Group: {activeGroup.name} · {activeGroup.pattern}
            </div>
          ) : activeAgent ? (
            <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              Agent: {activeAgent.name} · {activeAgent.model}
            </div>
          ) : (
            <ModelSelector sessionId={activeSession.id} />
          )}
          <div className="ml-auto flex items-center gap-1">
            {activeSession.messages.length > 0 && (
              <>
                <button
                  onClick={() => publishSession.mutate({ id: activeSessionId! })}
                  title="Share conversation"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  disabled={publishSession.isPending}
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => exportAsMarkdown(activeSession.messages, activeSession.title || "conversation")}
                  title="Export as Markdown"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
        <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} />
      </div>
    </div>
  );
}
