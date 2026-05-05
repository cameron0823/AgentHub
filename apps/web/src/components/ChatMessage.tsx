"use client";

import { ChatMessage as ChatMessageType } from "@/stores/chatStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bot, User, Loader2 } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex gap-3 px-4 py-5 ${isUser ? "bg-muted/30" : ""}`}>
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
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
        <div className="font-medium text-sm mb-1">
          {isUser ? "You" : message.model || "Assistant"}
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

        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.isStreaming && !message.content ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
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
      </div>
    </div>
  );
}
