"use client";

import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { forwardRef, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/stores/chatStore";
import { ChatMessageItem } from "./ChatMessage";

interface VirtualizedMessageListProps {
  messages: ChatMessage[];
  onBranch?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: (messageId: string) => void;
  onFeedback?: (messageId: string, feedback: "up" | "down") => void;
}

const MessageList = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) => (
    <div ref={ref} style={style} className="max-w-3xl mx-auto" {...props}>
      {children}
    </div>
  )
);

MessageList.displayName = "MessageList";

export function VirtualizedMessageList({ messages, onBranch, onEdit, onRegenerate, onFeedback }: VirtualizedMessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const scrollToLatest = () => {
      virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: "end", behavior: "auto" });
    };
    const frame = requestAnimationFrame(scrollToLatest);
    const timeout = window.setTimeout(scrollToLatest, 50);
    const interval = window.setInterval(scrollToLatest, 100);
    const stopInterval = window.setTimeout(() => window.clearInterval(interval), 1_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      window.clearTimeout(stopInterval);
    };
  }, [messages.length]);

  return (
    <Virtuoso
      key={messages.length}
      ref={virtuosoRef}
      data-testid="message-list"
      className="h-full"
      data={messages}
      followOutput="smooth"
      alignToBottom
      initialTopMostItemIndex={{ index: messages.length - 1, align: "end" }}
      increaseViewportBy={{ top: 600, bottom: 600 }}
      components={{ List: MessageList }}
      itemContent={(_, message) => (
        <ChatMessageItem
          message={message}
          onBranch={onBranch}
          onEdit={onEdit}
          onRegenerate={onRegenerate}
          onFeedback={onFeedback}
        />
      )}
    />
  );
}
