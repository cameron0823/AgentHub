"use client";

import { ChatMessage as ChatMessageType } from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, User, Loader2, Wrench, GitBranch, Pencil, RotateCcw, ThumbsUp, ThumbsDown, Copy, Check } from "lucide-react";
import { ToolCallCard } from "./ToolCallCard";
import { useState, useCallback } from "react";

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
              {isAssistant && onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback(message.id, "up")}
                    className="p-1 hover:bg-muted rounded"
                    title="Helpful"
                  >
                    <ThumbsUp className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => onFeedback(message.id, "down")}
                    className="p-1 hover:bg-muted rounded"
                    title="Not helpful"
                  >
                    <ThumbsDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
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
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}

        {isAssistant && message.toolCalls?.map((toolCall) => (
          <ToolCallCard key={toolCall.id} toolCall={toolCall} />
        ))}

        {isTool && message.toolResult && <ToolCallCard toolResult={message.toolResult} />}
      </div>
    </div>
  );
}
