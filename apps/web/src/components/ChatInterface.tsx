"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Download, GalleryHorizontalEnd, Share2, Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  useChatStore,
  ChatMessage,
  type GeneratedResource,
  type RagSource,
  type ReasoningTimelineEvent,
  type RouteDecision,
} from "@/stores/chatStore";
import { extractArtifactsFromContent, isChatArtifact, type ChatArtifact } from "@/lib/artifacts";
import { extractAgentMentions } from "@/lib/agent-mentions";
import type { A2UIClientEvent } from "@/lib/a2ui/actions";
import { formatA2UIEventMessage } from "@/lib/a2ui/parser";
import {
  appendMissingFileMentionTokens,
  buildFileSnapshotSystemBlock,
  mergeFileSnapshots,
  normalizeFileSnapshots,
  type FileSnapshot,
} from "@/lib/file-snapshots";
import { trpc } from "@/lib/trpc";
import { ChatInput, type ChatFileAttachment } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { VirtualizedMessageList } from "./VirtualizedMessageList";
import { generateSessionTitle, shouldAutoTitle } from "@/lib/title";
import { BranchNavigator } from "./BranchNavigator";
import { ContextWindowBar } from "./ContextWindowBar";
import { getContextLimit, estimateMessagesTokens, truncateToContextLimit } from "@agenthub/ai-providers";
import type { OrchestratorEvent } from "@agenthub/agent-runtime";
import { GroupPatternViz } from "./GroupPatternViz";
import { ArtifactPanel } from "./ArtifactPanel";
import { ArtifactGallerySidebar } from "./ArtifactGallerySidebar";
import { AgentWorkingPanel } from "./AgentWorkingPanel";
import type { BranchMode } from "./ChatMessage";

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

function isGeneratedResource(value: unknown): value is GeneratedResource {
  const type = (value as { type?: unknown } | null)?.type;
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (type === "image" || type === "file" || type === "chart" || type === "document") &&
    typeof (value as { url?: unknown }).url === "string"
  );
}

function parseMessageArtifacts(value: unknown): ChatArtifact[] {
  return Array.isArray(value) ? value.filter(isChatArtifact) : [];
}

function isReasoningTimelineEvent(value: unknown): value is ReasoningTimelineEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ReasoningTimelineEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.kind === "string" &&
    typeof event.title === "string" &&
    (event.visibility === "provider-visible" || event.visibility === "metadata-only" || event.visibility === "redacted")
  );
}

function parseReasoningTimeline(value: unknown): ReasoningTimelineEvent[] {
  return Array.isArray(value) ? value.filter(isReasoningTimelineEvent) : [];
}

function mergeReasoningTimeline(
  existing: ReasoningTimelineEvent[] | undefined,
  next: ReasoningTimelineEvent[],
): ReasoningTimelineEvent[] {
  const byId = new Map((existing ?? []).map((event) => [event.id, event]));
  for (const event of next) byId.set(event.id, event);
  return Array.from(byId.values());
}

function parseMessageMetadata(value: unknown): {
  ragSources?: RagSource[];
  routeDecision?: RouteDecision;
  generatedResources?: GeneratedResource[];
  sandboxResources?: GeneratedResource[];
  fileSnapshots?: FileSnapshot[];
  artifacts?: ChatArtifact[];
  reasoningTimeline?: ReasoningTimelineEvent[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = value as Record<string, unknown>;
  const generatedResources = Array.isArray(metadata.generatedResources)
    ? metadata.generatedResources.filter(isGeneratedResource)
    : [];
  const sandboxResources = Array.isArray(metadata.sandboxResources)
    ? metadata.sandboxResources.filter(isGeneratedResource)
    : [];
  const artifacts = parseMessageArtifacts(metadata.artifacts);
  const reasoningTimeline = parseReasoningTimeline(metadata.reasoningTimeline);
  const fileSnapshots = normalizeFileSnapshots(metadata.fileSnapshots);
  return {
    ragSources: Array.isArray(metadata.ragSources) ? (metadata.ragSources as RagSource[]) : undefined,
    routeDecision:
      metadata.routeDecision && typeof metadata.routeDecision === "object"
        ? (metadata.routeDecision as RouteDecision)
        : undefined,
    generatedResources: mergeGeneratedResources(generatedResources, sandboxResources),
    sandboxResources,
    artifacts,
    reasoningTimeline,
    fileSnapshots,
  };
}

function fileSnapshotsForMessage(message: ChatMessage): FileSnapshot[] {
  return message.fileSnapshots ?? normalizeFileSnapshots(message.metadata?.fileSnapshots);
}

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function generatedResourcesFromToolResult(result: unknown): GeneratedResource[] {
  if (!result || typeof result !== "object") {
    return [];
  }
  if (
    (result as { type?: unknown }).type === "generated_image" &&
    Array.isArray((result as { images?: unknown }).images)
  ) {
    return (result as { images: unknown[] }).images.filter(isGeneratedResource);
  }
  if (
    (result as { type?: unknown }).type === "sandbox_execution" &&
    Array.isArray((result as { outputs?: unknown }).outputs)
  ) {
    return (result as { outputs: unknown[] }).outputs.filter(isGeneratedResource);
  }
  return [];
}

function mergeGeneratedResources(existing: GeneratedResource[] | undefined, next: GeneratedResource[]) {
  const byId = new Map((existing ?? []).map((resource) => [resource.id, resource]));
  for (const resource of next) byId.set(resource.id, resource);
  return Array.from(byId.values());
}

type PendingApproval = {
  id: string;
  kind: "checkpoint" | "tool_action";
  title: string;
  plan: string;
  toolName?: string;
  argsPreview?: string;
  policyReason?: string;
};

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
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<ChatArtifact | null>(null);
  const [workingPanelOpen, setWorkingPanelOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

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
  const generateServerTitle = trpc.sessions.generateTitle.useMutation({
    onSuccess: (result, variables) => {
      if (!result.updated) return;
      useChatStore.getState().updateSession(variables.id, { title: result.title, updatedAt: new Date() });
      utils.sessions.list.invalidate();
    },
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
        metadata:
          newSession.metadata && typeof newSession.metadata === "object"
            ? (newSession.metadata as Record<string, unknown>)
            : null,
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
    { enabled: Boolean(activeSessionId) },
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeAgent = activeSession?.agentId ? agents.find((agent) => agent.id === activeSession.agentId) : undefined;
  const activeGroup = activeSession?.groupId
    ? agentGroups.find((group) => group.id === activeSession.groupId)
    : undefined;

  const currentModel = activeAgent?.model || selectedModel;
  const contextLimit = getContextLimit(currentModel);
  const activeFileSnapshotContext = buildFileSnapshotSystemBlock(
    mergeFileSnapshots((activeSession?.messages ?? []).flatMap(fileSnapshotsForMessage)),
  );
  const estimatedSessionTokens =
    estimateMessagesTokens(activeSession?.messages ?? []) + Math.ceil(activeFileSnapshotContext.length / 4);

  useEffect(() => {
    if (!activeSessionId || !messageList.data) return;
    setSessionMessages(
      activeSessionId,
      messageList.data.map((message) => {
        const toolCalls = parseToolCalls(message.toolCalls);
        const toolCall = toolCalls?.[0];
        const metadata = parseMessageMetadata(message.metadata);
        const messageArtifacts = parseMessageArtifacts(message.artifacts);
        const artifacts = messageArtifacts.length > 0 ? messageArtifacts : metadata.artifacts;

        return {
          id: message.id,
          sessionId: message.sessionId,
          role: message.role,
          content: message.content,
          reasoning: message.reasoning || undefined,
          reasoningTimeline: metadata.reasoningTimeline,
          toolCalls,
          toolCallId: message.role === "tool" ? toolCall?.id : undefined,
          toolName: message.role === "tool" ? toolCall?.function.name : undefined,
          toolResult:
            message.role === "tool"
              ? {
                  toolCallId: toolCall?.id,
                  toolName: toolCall?.function.name || "tool",
                  result: parseJsonValue(message.content),
                }
              : undefined,
          model: message.model || undefined,
          metadata:
            message.metadata && typeof message.metadata === "object"
              ? (message.metadata as Record<string, unknown>)
              : null,
          ragSources: metadata.ragSources,
          generatedResources: metadata.generatedResources,
          sandboxResources: metadata.sandboxResources,
          fileSnapshots: metadata.fileSnapshots,
          artifacts,
          routeDecision: metadata.routeDecision,
          createdAt: message.createdAt || undefined,
          tokensUsed: message.tokensUsed ?? null,
          latencyMs: message.latencyMs ?? null,
        };
      }),
    );
  }, [activeSessionId, messageList.data, setSessionMessages]);

  const handleSend = useCallback(
    async (content: string, fileAttachments?: ChatFileAttachment[]) => {
      if (!activeSessionId) return;

      const imageAttachments = fileAttachments?.filter((a) => a.type.startsWith("image/")) ?? [];
      const fileSnapshots = normalizeFileSnapshots(fileAttachments?.map((a) => a.snapshot).filter(Boolean) ?? []);
      const contentWithFileMentions = appendMissingFileMentionTokens(content, fileSnapshots);
      const fileOnlyAttachments = fileAttachments?.filter((a) => !a.type.startsWith("image/") && !a.snapshot) ?? [];
      const attachmentText = fileOnlyAttachments.length
        ? `\n\n[Attached files: ${fileOnlyAttachments.map((a) => `[${a.name}](${a.url})`).join(", ")}]`
        : "";
      const textContent = contentWithFileMentions + attachmentText;
      const mentionedAgentIds = extractAgentMentions(textContent).map((mention) => mention.id);

      // Build multipart content when images are present
      type ContentPart = { type: "text"; text: string } | { type: "image_url"; url: string };
      const messageContent: string | ContentPart[] =
        imageAttachments.length > 0
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
        imageUrls: imageAttachments.length > 0 ? imageAttachments.map((a) => a.url) : undefined,
        fileSnapshots,
        metadata: fileSnapshots.length > 0 ? { fileSnapshots } : null,
      };

      addMessage(activeSessionId, userMessage);
      const shouldGenerateTitle = shouldAutoTitle(activeSession?.title);
      if (shouldAutoTitle(activeSession?.title)) {
        const title = generateSessionTitle(content);
        if (title !== activeSession?.title) {
          useChatStore.getState().updateSession(activeSessionId, { title, updatedAt: new Date() });
        }
      }

      if (!activeGroup) {
        await createMessage.mutateAsync({
          id: userMsgId,
          sessionId: activeSessionId,
          role: "user",
          content: textContent,
          metadata: { fileSnapshots },
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
      const requestFileSnapshots = mergeFileSnapshots([
        ...(freshSession?.messages || []).flatMap(fileSnapshotsForMessage),
        ...fileSnapshots,
      ]);
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

      const truncatedMessages = truncateToContextLimit(sessionMessages, contextLimit);

      try {
        const res = await fetch(activeGroup ? "/api/groups/stream" : "/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            activeGroup
              ? {
                  groupId: activeGroup.id,
                  sessionId: activeSessionId,
                  task: content,
                }
              : {
                  sessionId: activeSessionId,
                  model: activeAgent?.model || selectedModel,
                  messages: truncatedMessages,
                  fileSnapshots: requestFileSnapshots,
                  mentionedAgentIds,
                  tools: activeAgent?.tools,
                },
          ),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          let message = `Request failed with status ${res.status}`;
          try {
            const payload = (await res.json()) as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            // Keep the status-based error.
          }
          throw new Error(message);
        }

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

              if (chunk.type === "orchestrator_event") {
                const ev = chunk.event as OrchestratorEvent;
                if (ev.type === "agent_start") {
                  setActiveAgentId(ev.agentId);
                  if (fullContent && !fullContent.endsWith("\n\n")) fullContent += "\n\n";
                  fullContent += `**${ev.agentName}:**\n`;
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
                if (ev.type === "agent_output" && ev.chunk.type === "content" && ev.chunk.content) {
                  fullContent += ev.chunk.content;
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
                if (ev.type === "agent_complete" && !fullContent.endsWith("\n\n")) {
                  fullContent += "\n\n";
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
                if (ev.type === "group_complete" && ev.synthesis) {
                  fullContent = ev.synthesis;
                  const currentAssistant = useChatStore
                    .getState()
                    .sessions.find((session) => session.id === activeSessionId)
                    ?.messages.find((message) => message.id === assistantMsgId);
                  updateMessage(activeSessionId, assistantMsgId, {
                    content: fullContent,
                    metadata: {
                      ...(currentAssistant?.metadata ?? {}),
                      groupComplete: true,
                      groupId: activeGroup?.id,
                      groupName: activeGroup?.name,
                      groupPattern: activeGroup?.pattern,
                      groupOutputs: ev.outputs,
                    },
                  });
                }
                if (ev.type === "supervisor_plan") {
                  fullContent += `\n\n> **Plan:** ${ev.plan}\n\n`;
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
                if (ev.type === "debate_round") {
                  fullContent += `\n\n---\n*Round ${ev.round} of ${ev.total}*\n\n`;
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
                if (ev.type === "groupchat_turn") {
                  fullContent += `\n\n---\n*Turn ${ev.turn} of ${ev.maxTurns}*\n\n`;
                  updateMessage(activeSessionId, assistantMsgId, { content: fullContent });
                }
              }

              if (chunk.type === "reasoning" && chunk.content) {
                fullReasoning += chunk.content;
                updateMessage(activeSessionId, assistantMsgId, {
                  reasoning: fullReasoning,
                });
              }

              if (chunk.type === "reasoning_event" && chunk.event) {
                const currentAssistant = useChatStore
                  .getState()
                  .sessions.find((session) => session.id === activeSessionId)
                  ?.messages.find((message) => message.id === assistantMsgId);
                updateMessage(activeSessionId, assistantMsgId, {
                  reasoningTimeline: mergeReasoningTimeline(currentAssistant?.reasoningTimeline, [chunk.event]),
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
                const generatedResources = generatedResourcesFromToolResult(chunk.result);
                if (generatedResources.length > 0) {
                  const sandboxResources = generatedResources.filter((resource) => resource.type !== "image");
                  const currentAssistant = useChatStore
                    .getState()
                    .sessions.find((session) => session.id === activeSessionId)
                    ?.messages.find((message) => message.id === assistantMsgId);
                  updateMessage(activeSessionId, assistantMsgId, {
                    generatedResources: mergeGeneratedResources(
                      currentAssistant?.generatedResources,
                      generatedResources,
                    ),
                    sandboxResources: mergeGeneratedResources(currentAssistant?.sandboxResources, sandboxResources),
                  });
                }
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

              if (chunk.type === "route_decision" && chunk.routeDecision) {
                updateMessage(activeSessionId, assistantMsgId, {
                  model: chunk.routeDecision.modelId,
                  routeDecision: chunk.routeDecision,
                });
              }

              if (chunk.type === "done") {
                setActiveAgentId(null);
                const contentArtifacts = extractArtifactsFromContent(fullContent);
                updateMessage(activeSessionId, assistantMsgId, {
                  isStreaming: false,
                  artifacts: contentArtifacts,
                  tokensUsed: (chunk as { tokensUsed?: number }).tokensUsed ?? null,
                  latencyMs: (chunk as { latencyMs?: number }).latencyMs ?? null,
                });
                if (contentArtifacts.length > 0) {
                  setActiveArtifact((current) => current ?? contentArtifacts[0]);
                }
                if (shouldGenerateTitle) {
                  generateServerTitle.mutate({ id: activeSessionId });
                }
              }

              if (chunk.type === "persisted" && chunk.messageId) {
                replaceMessageId(activeSessionId, assistantMsgId, chunk.messageId);
                utils.messages.list.invalidate({ sessionId: activeSessionId });
              }

              if (chunk.type === "hitl_checkpoint") {
                setPendingApproval({
                  id: chunk.checkpointId,
                  kind: "checkpoint",
                  title: chunk.title,
                  plan: chunk.plan,
                });
              }

              if (chunk.type === "approval_request") {
                const request = chunk.request ?? {};
                setPendingApproval({
                  id: chunk.approvalId,
                  kind: "tool_action",
                  title: request.title ?? "Human approval required",
                  plan: request.prompt ?? "Approve this action before it runs.",
                  toolName: request.toolName,
                  argsPreview: request.argsPreview,
                  policyReason: request.policyReason,
                });
              }

              if (chunk.type === "error") {
                updateMessage(activeSessionId, assistantMsgId, {
                  content: `⚠️ ${chunk.error}`,
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
            content: `⚠️ ${(err as Error).message}`,
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
    [
      activeSessionId,
      activeSession,
      activeAgent,
      activeGroup,
      selectedModel,
      contextLimit,
      addMessage,
      updateMessage,
      replaceMessageId,
      setIsGenerating,
      createMessage,
      generateServerTitle,
      utils.messages.list,
    ],
  );

  const handleApproval = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;
      const id = pendingApproval.id;
      const approvalId = pendingApproval.kind === "tool_action" ? id : undefined;
      const checkpointId = pendingApproval.kind === "checkpoint" ? id : undefined;
      setPendingApproval(null);
      await fetch("/api/chat/checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId, approvalId, approved }),
      });
    },
    [pendingApproval],
  );

  const handleA2UIEvent = useCallback(
    async (event: A2UIClientEvent) => {
      await handleSend(formatA2UIEventMessage(event));
    },
    [handleSend],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    if (!activeSessionId) return;

    const streamingAssistant = activeSession?.messages.find(
      (message) => message.role === "assistant" && message.isStreaming,
    );
    if (streamingAssistant) {
      updateMessage(activeSessionId, streamingAssistant.id, { isStreaming: false });
    }
  }, [activeSessionId, activeSession, setIsGenerating, updateMessage]);

  const handleBranch = useCallback(
    (messageId: string, mode: BranchMode = "continuation") => {
      if (!activeSessionId) return;
      forkSession.mutate({ id: activeSessionId, messageId, mode });
    },
    [activeSessionId, forkSession],
  );

  const handleEdit = useCallback(
    async (messageId: string, newContent: string) => {
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
    },
    [activeSessionId, updateMessage, updateServerMessage, deleteMessagesAfter, handleSend],
  );

  const handleRegenerate = useCallback(
    async (messageId: string) => {
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
    },
    [activeSessionId, deleteServerMessage, handleSend],
  );

  const handleFeedback = useCallback((_messageId: string, _feedback: "up" | "down") => {
    // Feedback stored locally only for now — Phase 19 wires to backend
  }, []);

  if (!activeSession) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="w-full max-w-[20rem] px-4 text-center sm:max-w-lg">
          <p className="mb-20 text-sm font-medium uppercase tracking-[0.18em] text-white/80 sm:mb-28">
            Home / Chat Dashboard
          </p>
          <h2 className="mb-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">New Conversation</h2>
          <p className="mx-auto max-w-[17rem] text-base leading-6 text-slate-200 sm:max-w-none">
            Start a new conversation to chat with your local AI.
          </p>
        </div>
      </div>
    );
  }

  const groupAgentNames = activeGroup
    ? Object.fromEntries(
        activeGroup.members.map((m) => [
          m.agentId,
          agents.find((a) => a.id === m.agentId)?.name ?? m.agentId.slice(0, 6),
        ]),
      )
    : {};

  return (
    <div className="agenthub-chat-shell flex h-full flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {activeGroup && isGenerating && (
          <GroupPatternViz
            group={activeGroup}
            agentNames={groupAgentNames}
            activeAgentId={activeAgentId}
            isStreaming={isGenerating}
          />
        )}
        <div className="min-h-0 flex-1">
          <BranchNavigator
            parentMessageId={activeSession.parentMessageId}
            activeSessionId={activeSession.id}
            onSwitch={(sessionId) => useChatStore.getState().setActiveSession(sessionId)}
          />
          {activeSession.messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-[20rem] px-4 text-center sm:max-w-lg">
                {(activeAgent as any)?.openingMessage ? (
                  <>
                    <div className="agenthub-glass-panel mb-4 rounded-2xl px-5 py-4 text-left text-sm">
                      {(activeAgent as any).openingMessage}
                    </div>
                    {((activeAgent as any).openingQuestions as string[] | undefined)?.length ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {((activeAgent as any).openingQuestions as string[]).map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSend(q)}
                            className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-100 transition-colors hover:bg-white/15"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div>
                    <p className="mb-20 text-sm font-medium uppercase tracking-[0.18em] text-white/80 sm:mb-28">
                      Home / Chat Dashboard
                    </p>
                    <h2 className="mb-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                      New Conversation
                    </h2>
                    <p className="mx-auto max-w-[17rem] text-base leading-6 text-slate-200 sm:max-w-none sm:text-lg sm:leading-7">
                      Send a message to start chatting with
                      <br className="hidden sm:block" /> {activeGroup?.name || activeAgent?.name || selectedModel}.
                    </p>
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
              onOpenArtifact={setActiveArtifact}
              onA2UIEvent={handleA2UIEvent}
            />
          )}
        </div>

        {pendingApproval && (
          <div
            data-testid={pendingApproval.kind === "tool_action" ? "hitl-approval" : "legacy-checkpoint"}
            className="border-t border-amber-400/20 bg-amber-950/30 px-4 py-3"
          >
            <div className="max-w-3xl mx-auto">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">{pendingApproval.title}</p>
              {pendingApproval.toolName && (
                <p className="mb-1 text-xs text-muted-foreground">Tool action approval: {pendingApproval.toolName}</p>
              )}
              <p className="text-xs text-muted-foreground line-clamp-3 mb-3 font-mono whitespace-pre-wrap">
                {pendingApproval.plan.slice(0, 400)}
                {pendingApproval.plan.length > 400 ? "..." : ""}
              </p>
              {pendingApproval.argsPreview && (
                <pre className="mb-3 max-h-24 overflow-auto rounded-lg bg-black/20 p-2 text-xs">
                  {pendingApproval.argsPreview}
                </pre>
              )}
              {pendingApproval.policyReason && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">{pendingApproval.policyReason}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproval(true)}
                  className="px-3 py-1.5 rounded text-xs bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Approve &amp; Continue
                </button>
                <button
                  onClick={() => handleApproval(false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition-colors hover:bg-white/10"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-white/10 bg-black/10 p-3 backdrop-blur-xl">
          <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2">
            <button
              className="rounded p-1.5 text-muted-foreground hover:bg-white/10 md:hidden"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            {activeGroup ? (
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                Group: {activeGroup.name} · {activeGroup.pattern}
              </div>
            ) : activeAgent ? (
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                Agent: {activeAgent.name} · {activeAgent.model}
              </div>
            ) : (
              <ModelSelector sessionId={activeSession.id} />
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                data-testid="artifact-gallery-toggle"
                onClick={() => setGalleryOpen((open) => !open)}
                title={galleryOpen ? "Close artifact gallery" : "Open artifact gallery"}
                className="rounded p-1.5 text-muted-foreground hover:bg-white/10"
              >
                <GalleryHorizontalEnd className="w-4 h-4" />
              </button>
              <button
                data-testid="working-panel-toggle"
                onClick={() => setWorkingPanelOpen((open) => !open)}
                title={workingPanelOpen ? "Close working panel" : "Open working panel"}
                className="rounded p-1.5 text-muted-foreground hover:bg-white/10"
              >
                {workingPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </button>
              {activeSession.messages.length > 0 && (
                <>
                  <button
                    onClick={() => publishSession.mutate({ id: activeSessionId! })}
                    title="Share conversation"
                    className="rounded p-1.5 text-muted-foreground hover:bg-white/10"
                    disabled={publishSession.isPending}
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => exportAsMarkdown(activeSession.messages, activeSession.title || "conversation")}
                    title="Export as Markdown"
                    className="rounded p-1.5 text-muted-foreground hover:bg-white/10"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          <ContextWindowBar usedTokens={estimatedSessionTokens} limitTokens={contextLimit} />
          <ChatInput onSend={handleSend} onStop={handleStop} isGenerating={isGenerating} />
        </div>
      </div>
      {workingPanelOpen && <AgentWorkingPanel session={activeSession} onClose={() => setWorkingPanelOpen(false)} />}
      {galleryOpen && (
        <ArtifactGallerySidebar
          artifacts={activeSession.messages.flatMap((m) => m.artifacts ?? [])}
          activeId={activeArtifact?.id ?? null}
          onSelect={(a) => setActiveArtifact(a)}
          onClose={() => setGalleryOpen(false)}
        />
      )}
      {activeArtifact && <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />}
    </div>
  );
}
