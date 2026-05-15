"use client";

/* eslint-disable @next/next/no-img-element -- Chat attachments are arbitrary user-provided URLs/data that cannot be predeclared for next/image. */

import { ChatMessage as ChatMessageType, RagSource } from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, User, Loader2, Wrench, GitBranch, Pencil, RotateCcw, ThumbsUp, ThumbsDown, Copy, Check, Clock } from "lucide-react";
import { ToolCallCard } from "./ToolCallCard";
import { MermaidBlock } from "./MermaidBlock";
import { TTSButton } from "./TTSButton";
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useChatStore } from "@/stores/chatStore";

function insertCitationLinks(content: string, sourceCount: number): string {
  if (sourceCount === 0) return content;
  return content.replace(/\[(\d+)\]/g, (match, n) => {
    const num = parseInt(n, 10);
    if (num < 1 || num > sourceCount) return match;
    return `[[${n}]](#cite-${n})`;
  });
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 hover:bg-muted text-muted-foreground opacity-0 group-hover/code:opacity-100 transition-opacity"
      title="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

interface ChatMessageProps {
  message: ChatMessageType;
  onBranch?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: "up" | "down") => void;
}

export function ChatMessageItem({ message, onBranch, onEdit, onRegenerate, onFeedback }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);

  const copyMessage = useCallback(() => {
    void navigator.clipboard.writeText(message.content).then(() => {
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    });
  }, [message.content]);

  const { updateMessage } = useChatStore();
  const setFeedback = trpc.messages.setFeedback.useMutation({
    onSuccess: (_, variables) => {
      updateMessage(message.sessionId!, message.id, { feedback: variables.feedback ?? undefined });
    },
  });

  const handleFeedback = (value: "up" | "down") => {
    const next = message.feedback === value ? null : value;
    setFeedback.mutate({ id: message.id, feedback: next });
  };

  const sourceCount = message.ragSources?.length ?? 0;
  const displayContent = isAssistant ? insertCitationLinks(message.content, sourceCount) : message.content;

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group flex gap-3 px-4 py-5 ${isUser ? "bg-muted/30" : ""}`}
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
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
            {message.isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
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
                <button
                  onClick={copyMessage}
                  className="p-1 hover:bg-muted rounded"
                  title="Copy message"
                >
                  {msgCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              )}
              {message.createdAt && (
                <button
                  onClick={() => setShowTimestamp((prev) => !prev)}
                  className={`p-1 hover:bg-muted rounded ${showTimestamp ? "text-primary" : "text-muted-foreground"}`}
                  title="Toggle timestamp"
                >
                  <Clock className="w-3 h-3" />
                </button>
              )}
              {isUser && onEdit && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 hover:bg-muted rounded"
                  title="Edit message"
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {isAssistant && onRegenerate && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1 hover:bg-muted rounded"
                  title="Regenerate"
                >
                  <RotateCcw className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {(isUser || isAssistant) && onBranch && (
                <button
                  onClick={() => onBranch(message.id)}
                  className="p-1 hover:bg-muted rounded"
                  title="Branch conversation"
                >
                  <GitBranch className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {isAssistant && (
                <>
                  <button
                    onClick={() => handleFeedback("up")}
                    className={`p-1 hover:bg-muted rounded ${message.feedback === "up" ? "text-green-500" : "text-muted-foreground"}`}
                    title="Helpful"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback("down")}
                    className={`p-1 hover:bg-muted rounded ${message.feedback === "down" ? "text-red-500" : "text-muted-foreground"}`}
                    title="Not helpful"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </>
              )}
              {isAssistant && message.content && (
                <TTSButton content={message.content} />
              )}
            </div>
          )}
          {showTimestamp && message.createdAt && (
            <span className="text-[10px] text-muted-foreground ml-1 select-none">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {message.reasoning && (
          <details className="mb-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              Thinking...
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-muted-foreground whitespace-pre-wrap">
              {message.reasoning}
            </div>
          </details>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background min-h-[80px]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md"
              >
                Save & Regenerate
              </button>
              <button
                onClick={() => { setIsEditing(false); setEditContent(message.content); }}
                className="px-3 py-1 text-sm border rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {message.isStreaming && !message.content ? (
              <div className="flex items-center gap-1 text-muted-foreground" data-testid="streaming-indicator">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
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
                      <div className="relative group/code">
                        <CopyButton content={codeText} />
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {codeText}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className={`${className ?? ""} px-1 py-0.5 rounded bg-muted font-mono text-sm`} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a({ href, children, ...props }: any) {
                    if (href?.startsWith("#cite-")) {
                      return (
                        <sup>
                          <a
                            href={href}
                            className="text-primary hover:underline font-mono text-[10px] no-underline"
                            {...props}
                          >
                            {children}
                          </a>
                        </sup>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
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

        {isAssistant && message.ragSources && message.ragSources.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              Sources ({message.ragSources.length})
            </summary>
            <div className="mt-2 space-y-2">
              {message.ragSources.map((s: RagSource, i: number) => (
                <div key={s.id} id={`cite-${i + 1}`} className="p-2 rounded border bg-muted/30 scroll-mt-16">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-primary">[{i + 1}]</span>
                    <span>{(s.similarity * 100).toFixed(1)}% match</span>
                  </div>
                  <p className="text-xs mt-1 line-clamp-2">{s.content}</p>
                </div>
              ))}
            </div>
          </details>
        )}

        {isAssistant && message.toolCalls?.map((toolCall) => (
          <ToolCallCard key={toolCall.id} toolCall={toolCall} />
        ))}

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
