"use client";

/* eslint-disable @next/next/no-img-element -- Chat attachments are arbitrary user-provided URLs/data that cannot be predeclared for next/image. */

import {
  ChatMessage as ChatMessageType,
  RagSource,
  type ChatArtifact,
  type GeneratedResource,
  type RouteDecision,
} from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MarkdownCodeBlock } from "@agenthub/ui";
import {
  Bot,
  User,
  Loader2,
  Wrench,
  GitBranch,
  Pencil,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Clock,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { ToolCallCard } from "./ToolCallCard";
import { MermaidBlock } from "./MermaidBlock";
import { TTSButton } from "./TTSButton";
import { SandboxOutput } from "./SandboxOutput";
import { ReasoningTimeline } from "./ReasoningTimeline";
import { KnowledgeSourceViewer } from "./KnowledgeSourceViewer";
import { A2UISurface } from "./A2UISurface";
import { sanitizeMarkdownUrl } from "@/lib/security/sanitize";
import type { A2UIClientEvent } from "@/lib/a2ui/actions";
import { extractA2UIBlocks } from "@/lib/a2ui/parser";
import { extractAgentMentions, replaceAgentMentionTokens } from "@/lib/agent-mentions";
import { extractFileMentions, normalizeFileSnapshots, replaceFileMentionTokens } from "@/lib/file-snapshots";
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useChatStore } from "@/stores/chatStore";

export type BranchMode = "continuation" | "standalone";

function insertCitationLinks(content: string, sourceCount: number): string {
  if (sourceCount === 0) return content;
  return content.replace(/\[(\d+)\]/g, (match, n) => {
    const num = parseInt(n, 10);
    if (num < 1 || num > sourceCount) return match;
    return `[[${n}]](#cite-${n})`;
  });
}

function getRouteDecision(message: ChatMessageType): RouteDecision | undefined {
  if (message.routeDecision) return message.routeDecision;
  const metadata = message.metadata;
  const routeDecision = metadata?.routeDecision;
  return routeDecision && typeof routeDecision === "object" ? (routeDecision as RouteDecision) : undefined;
}

function uniqueResources(resources: GeneratedResource[]) {
  return Array.from(new Map(resources.map((resource) => [resource.id, resource])).values());
}

function reasoningTimelineForMessage(message: ChatMessageType) {
  if (message.reasoningTimeline && message.reasoningTimeline.length > 0) return message.reasoningTimeline;
  if (!message.reasoning) return [];
  return [
    {
      id: `${message.id}-provider-reasoning`,
      kind: "provider_reasoning" as const,
      title: "Provider reasoning",
      content: message.reasoning,
      visibility: "provider-visible" as const,
    },
  ];
}

function isGroupCompleteMessage(message: ChatMessageType) {
  return message.role === "assistant" && message.metadata?.groupComplete === true;
}

interface ChatMessageProps {
  message: ChatMessageType;
  onBranch?: (messageId: string, mode?: BranchMode) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: "up" | "down") => void;
  onOpenArtifact?: (artifact: ChatArtifact) => void;
  onA2UIEvent?: (event: A2UIClientEvent) => void | Promise<void>;
}

export function ChatMessageItem({
  message,
  onBranch,
  onEdit,
  onRegenerate,
  onFeedback,
  onOpenArtifact,
  onA2UIEvent,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);
  const [showBranchModes, setShowBranchModes] = useState(false);
  const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null);

  const copyMessage = useCallback(() => {
    void navigator.clipboard.writeText(message.content).then(() => {
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    });
  }, [message.content]);

  const { updateMessage, sessions, activeSessionId, agents, setActiveAgent, setMainView } = useChatStore();
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const activeAgent = activeSession?.agentId ? agents.find((agent) => agent.id === activeSession.agentId) : undefined;
  const allGeneratedResources = message.generatedResources ?? [];
  const generatedResources = allGeneratedResources.filter((resource) => resource.type === "image");
  const sandboxResources = uniqueResources([
    ...allGeneratedResources.filter((resource) => resource.type !== "image"),
    ...(message.sandboxResources ?? []),
  ]);
  const setFeedback = trpc.messages.setFeedback.useMutation({
    onSuccess: (_, variables) => {
      updateMessage(message.sessionId!, message.id, { feedback: variables.feedback ?? undefined });
    },
  });
  const createPageFromMessage = trpc.pages.createFromChatMessage.useMutation({
    onSuccess: () => {
      window.location.href = "/pages";
    },
  });

  const handleFeedback = (value: "up" | "down") => {
    const next = message.feedback === value ? null : value;
    setFeedback.mutate({ id: message.id, feedback: next });
  };

  const sourceCount = message.ragSources?.length ?? 0;
  const activeSource = activeSourceIndex === null ? undefined : message.ragSources?.[activeSourceIndex];
  const citationContent = isAssistant ? insertCitationLinks(message.content, sourceCount) : message.content;
  const a2uiBlocks = isAssistant
    ? extractA2UIBlocks(citationContent)
    : { text: citationContent, actions: [], errors: [] };
  const displayContent = replaceFileMentionTokens(replaceAgentMentionTokens(a2uiBlocks.text));
  const agentMentions = extractAgentMentions(message.content).map((mention) => ({
    mention,
    agent: agents.find((agent) => agent.id === mention.id),
  }));
  const fileSnapshots = message.fileSnapshots ?? normalizeFileSnapshots(message.metadata?.fileSnapshots);
  const fileSnapshotsById = new Map(fileSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const fileMentions = extractFileMentions(message.content).map((mention) => ({
    mention,
    snapshot: fileSnapshotsById.get(mention.id),
  }));
  const routeDecision = isAssistant ? getRouteDecision(message) : undefined;
  const reasoningTimeline = isAssistant ? reasoningTimelineForMessage(message) : [];
  const isGroupComplete = isGroupCompleteMessage(message);
  const canCreatePageFromMessage =
    (isUser || isAssistant) &&
    Boolean(message.content) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.id);

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleOpenCitation = useCallback(
    (index: number) => {
      const source = message.ragSources?.[index];
      if (!source) return;
      setActiveSourceIndex(index);
      window.setTimeout(() => {
        document.getElementById(`cite-${index + 1}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 0);
    },
    [message.ragSources],
  );

  return (
    <div
      className={`group flex gap-3 px-4 py-5 ${isUser ? "bg-white/[0.08]" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      data-testid="chat-message"
    >
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
        ) : isTool ? (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            {message.isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="font-medium text-sm">
            {isUser ? "You" : isTool ? message.toolName || "Tool" : message.model || "Assistant"}
          </div>

          {/* Message actions */}
          {showActions && !message.isStreaming && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {(isUser || isAssistant) && message.content && (
                <button onClick={copyMessage} className="rounded p-1 hover:bg-white/10" title="Copy message">
                  {msgCopied ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
              )}
              {message.createdAt && (
                <button
                  onClick={() => setShowTimestamp((prev) => !prev)}
                  className={`rounded p-1 hover:bg-white/10 ${showTimestamp ? "text-primary" : "text-muted-foreground"}`}
                  title="Toggle timestamp"
                >
                  <Clock className="w-3 h-3" />
                </button>
              )}
              {canCreatePageFromMessage && (
                <button
                  onClick={() => createPageFromMessage.mutate({ messageId: message.id })}
                  className="rounded p-1 hover:bg-white/10"
                  title="Create page from message"
                >
                  <FileText className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {isUser && onEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded p-1 hover:bg-white/10"
                  title="Edit message"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {isAssistant && onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="rounded p-1 hover:bg-white/10"
                  title="Regenerate"
                >
                  <RotateCcw className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {(isUser || isAssistant) && onBranch && (
                <div className="relative">
                  <button
                    onClick={() => setShowBranchModes((open) => !open)}
                    className="rounded p-1 hover:bg-white/10"
                    title="Branch conversation"
                  >
                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                  </button>
                  {showBranchModes && (
                    <div
                      data-testid="branch-mode-controls"
                      className="absolute left-0 top-6 z-20 w-48 rounded-lg border border-white/10 bg-background/95 p-1 text-xs shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowBranchModes(false);
                          onBranch(message.id, "continuation");
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                      >
                        <span className="block font-medium">Continuation</span>
                        <span className="text-[10px] text-muted-foreground">Keep prior context</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBranchModes(false);
                          onBranch(message.id, "standalone");
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                      >
                        <span className="block font-medium">Standalone</span>
                        <span className="text-[10px] text-muted-foreground">Branch from here only</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isAssistant && (
                <>
                  <button
                    onClick={() => handleFeedback("up")}
                    className={`rounded p-1 hover:bg-white/10 ${message.feedback === "up" ? "text-green-500" : "text-muted-foreground"}`}
                    title="Helpful"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback("down")}
                    className={`rounded p-1 hover:bg-white/10 ${message.feedback === "down" ? "text-red-500" : "text-muted-foreground"}`}
                    title="Not helpful"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )}
              {isAssistant && message.content && <TTSButton content={message.content} />}
            </div>
          )}
          {isAssistant && !message.isStreaming && message.content && !showActions && activeAgent?.handsFreeVoice ? (
            <TTSButton content={message.content} autoPlay />
          ) : null}
          {showTimestamp && message.createdAt && (
            <span className="text-[10px] text-muted-foreground ml-1 select-none">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {reasoningTimeline.length > 0 && <ReasoningTimeline events={reasoningTimeline} />}

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="agenthub-field min-h-[80px] w-full px-3 py-2"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} className="agenthub-primary-button rounded-xl px-3 py-1 text-sm">
                Save & Regenerate
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content);
                }}
                className="agenthub-secondary-button px-3 py-1 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            data-testid={isGroupComplete ? "synthesis-panel" : undefined}
          >
            {isGroupComplete && (
              <span data-testid="group-complete" className="sr-only">
                Group complete
              </span>
            )}
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-1 text-muted-foreground" data-testid="streaming-indicator">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeText = String(children).replace(/\n$/, "");
                    if (!inline && match?.[1] === "mermaid") {
                      return <MermaidBlock code={codeText} />;
                    }
                    return !inline && match ? (
                      <MarkdownCodeBlock code={codeText} language={match[1]} />
                    ) : (
                      <code
                        className={`${className ?? ""} rounded bg-white/10 px-1 py-0.5 font-mono text-sm`}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  a({ href, children, ...props }: any) {
                    const safeHref = sanitizeMarkdownUrl(href);
                    if (href?.startsWith("#cite-")) {
                      const citationIndex = Number.parseInt(href.replace("#cite-", ""), 10);
                      return (
                        <sup>
                          <button
                            type="button"
                            data-testid="citation-jump-link"
                            data-citation-index={Number.isFinite(citationIndex) ? citationIndex : undefined}
                            onClick={(event) => {
                              event.preventDefault();
                              if (Number.isFinite(citationIndex)) handleOpenCitation(citationIndex - 1);
                            }}
                            className="text-primary hover:underline font-mono text-[10px] no-underline"
                            {...props}
                          >
                            {children}
                          </button>
                        </sup>
                      );
                    }
                    if (!safeHref) return <span>{children}</span>;
                    return (
                      <a href={safeHref} target="_blank" rel="noopener noreferrer" {...props}>
                        {children}
                      </a>
                    );
                  },
                  img({ src, alt, ...props }: any) {
                    const safeSrc = sanitizeMarkdownUrl(src);
                    if (!safeSrc) return null;
                    return <img src={safeSrc} alt={alt ?? ""} {...props} />;
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
          </div>
        )}

        {isAssistant && a2uiBlocks.actions.length > 0 && (
          <div className="mt-3 space-y-3" data-testid="a2ui-surfaces">
            {a2uiBlocks.actions.map((action, index) => (
              <A2UISurface
                key={`${message.id}-a2ui-${index}`}
                action={action}
                sessionId={activeSessionId ?? message.sessionId}
                onEvent={onA2UIEvent}
              />
            ))}
          </div>
        )}

        {agentMentions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {agentMentions.map(({ mention, agent }) => (
              <button
                key={mention.id}
                type="button"
                data-testid="agent-mention-card"
                data-agent-mention-source="mentioned-agent"
                onClick={() => {
                  if (!agent) return;
                  setActiveAgent(agent.id);
                  setMainView("agent-builder");
                }}
                className="flex max-w-xs items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm no-underline transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-70"
                disabled={!agent}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {(agent?.name ?? mention.name).slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Mentioned agent
                  </span>
                  <span className="block truncate font-medium text-foreground">{agent?.name ?? mention.name}</span>
                  {(agent?.description || agent?.model) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.description || agent.model}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {fileMentions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {fileMentions.map(({ mention, snapshot }) => {
              const cardBody = (
                <>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      File snapshot
                    </span>
                    <span className="block truncate font-medium text-foreground">{snapshot?.name ?? mention.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {snapshot
                        ? `${snapshot.mimeType} / ${snapshot.size.toLocaleString()} bytes / ${snapshot.hash.slice(0, 12)}`
                        : "Snapshot metadata unavailable"}
                    </span>
                  </span>
                </>
              );

              return snapshot?.url ? (
                <a
                  key={mention.id}
                  href={snapshot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="file-mention-card"
                  className="flex max-w-sm items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm no-underline transition-colors hover:bg-white/10"
                >
                  {cardBody}
                </a>
              ) : (
                <div
                  key={mention.id}
                  data-testid="file-mention-card"
                  className="flex max-w-sm items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm"
                >
                  {cardBody}
                </div>
              );
            })}
          </div>
        )}

        {isUser && message.imageUrls && message.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="max-h-48 max-w-xs rounded-lg border object-cover hover:opacity-90 transition-opacity"
                />
              </a>
            ))}
          </div>
        )}

        {isAssistant && activeSource && activeSourceIndex !== null && (
          <KnowledgeSourceViewer
            source={activeSource}
            index={activeSourceIndex + 1}
            onClose={() => setActiveSourceIndex(null)}
          />
        )}

        {isAssistant && generatedResources.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Generated Images</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {generatedResources.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-white/10 bg-white/5 no-underline transition-colors hover:bg-white/10"
                >
                  <img
                    src={resource.url}
                    alt={resource.revisedPrompt || resource.prompt || "Generated image"}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="space-y-1 px-3 py-2 text-xs">
                    <div className="line-clamp-2 text-foreground">
                      {resource.revisedPrompt || resource.prompt || "Generated image"}
                    </div>
                    {(resource.providerId || resource.model) && (
                      <div className="truncate text-muted-foreground">
                        {[resource.providerId, resource.model].filter(Boolean).join(" / ")}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {isAssistant && message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3" data-testid="message-artifacts">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Artifacts</div>
            <div className="flex flex-wrap gap-2">
              {message.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => onOpenArtifact?.(artifact)}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs text-foreground transition-colors hover:bg-white/10"
                >
                  {artifact.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {isAssistant && sandboxResources.length > 0 && (
          <div className="mt-3">
            <SandboxOutput resources={sandboxResources} />
          </div>
        )}

        {isAssistant && message.ragSources && message.ragSources.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              Sources ({message.ragSources.length})
            </summary>
            <div className="mt-2 space-y-2">
              {message.ragSources.map((s: RagSource, i: number) => (
                <button
                  key={s.id}
                  id={`cite-${i + 1}`}
                  type="button"
                  data-testid="rag-source-open"
                  onClick={() => handleOpenCitation(i)}
                  className={`block w-full scroll-mt-16 rounded-xl border p-2 text-left transition-colors ${
                    activeSourceIndex === i
                      ? "border-primary/50 bg-primary/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-primary">[{i + 1}]</span>
                    <span>{(s.similarity * 100).toFixed(1)}% match</span>
                    {s.sourceName && <span className="truncate">{s.sourceName}</span>}
                  </div>
                  {s.citation && <div className="mt-1 truncate text-[11px] text-muted-foreground">{s.citation}</div>}
                  <p className="text-xs mt-1 line-clamp-2">{s.content}</p>
                </button>
              ))}
            </div>
          </details>
        )}

        {isAssistant && routeDecision && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              Route decision
            </summary>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{routeDecision.strategy}</span>
                <span className="mx-1">{"->"}</span>
                <span className="font-mono">{routeDecision.modelId}</span>
              </div>
              <div className="mt-1">{routeDecision.reason}</div>
            </div>
          </details>
        )}

        {isAssistant && message.toolCalls?.map((toolCall) => <ToolCallCard key={toolCall.id} toolCall={toolCall} />)}

        {isTool && message.toolResult && <ToolCallCard toolResult={message.toolResult} />}

        {isAssistant && !message.isStreaming && (message.tokensUsed || message.latencyMs) && (
          <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground/60 select-none">
            {message.tokensUsed ? <span>~{message.tokensUsed} tok</span> : null}
            {message.latencyMs ? <span>{(message.latencyMs / 1000).toFixed(1)}s</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
