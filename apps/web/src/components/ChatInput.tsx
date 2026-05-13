"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square, Paperclip, X, FileText, Image } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { VoiceInput } from "./VoiceInput";

interface Attachment {
  file: File;
  url?: string;
  s3Key?: string;
  uploading: boolean;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: { url: string; name: string; type: string }[]) => void;
  onStop: () => void;
  isGenerating: boolean;
}

export function ChatInput({ onSend, onStop, isGenerating }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: slashResults } = trpc.promptLibrary.list.useQuery(
    { search: slashQuery ?? "" },
    { enabled: slashQuery !== null }
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashQuery]);

  const insertPrompt = useCallback((content: string) => {
    setInput(content);
    setSlashQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        textareaRef.current.focus();
      }
    }, 0);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;

    const uploadedAttachments = attachments
      .filter((a) => a.url && !a.uploading)
      .map((a) => ({ url: a.url!, name: a.file.name, type: a.file.type }));

    onSend(trimmed, uploadedAttachments);
    setInput("");
    setAttachments([]);
    setSlashQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachments, isGenerating, onSend]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (slashQuery !== null && slashResults && slashResults.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(slashResults.length - 1, i + 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertPrompt(slashResults[selectedIndex].content);
        return;
      }
      if (e.key === "Escape") {
        setSlashQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;

    if (value.startsWith("/")) {
      setSlashQuery(value.slice(1));
    } else {
      setSlashQuery(null);
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      file,
      uploading: true,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);

    for (const attachment of newAttachments) {
      try {
        const res = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: attachment.file.name,
            contentType: attachment.file.type,
          }),
        });

        if (!res.ok) throw new Error("Failed to get presigned URL");

        const { url, key } = await res.json();

        const uploadRes = await fetch(url, {
          method: "PUT",
          body: attachment.file,
          headers: { "Content-Type": attachment.file.type },
        });

        if (!uploadRes.ok) throw new Error("Upload failed");

        setAttachments((prev) =>
          prev.map((a) =>
            a.file === attachment.file
              ? { ...a, url: url.split("?")[0], s3Key: key, uploading: false }
              : a
          )
        );
      } catch {
        setAttachments((prev) => prev.filter((a) => a.file !== attachment.file));
      }
    }
  };

  const removeAttachment = (file: File) => {
    setAttachments((prev) => prev.filter((a) => a.file !== file));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <Image className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="border-t bg-background p-4">
      <div className="max-w-3xl mx-auto">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att) => (
              <div
                key={att.file.name}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs"
              >
                {getFileIcon(att.file.type)}
                <span className="max-w-[120px] truncate">{att.file.name}</span>
                {att.uploading && <span className="text-muted-foreground">uploading...</span>}
                <button
                  onClick={() => removeAttachment(att.file)}
                  className="p-0.5 hover:bg-muted-foreground/20 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          {/* Slash command popover */}
          {slashQuery !== null && slashResults && slashResults.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-lg border bg-popover shadow-md overflow-hidden">
              {slashResults.slice(0, 8).map((prompt, i) => (
                <button
                  key={prompt.id}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertPrompt(prompt.content);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="font-medium truncate">{prompt.title}</span>
                  {prompt.tags && prompt.tags.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {prompt.tags[0]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message your local AI... (type / for prompts)"
            disabled={isGenerating}
            rows={1}
            className="w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            style={{ minHeight: "48px", maxHeight: "200px" }}
          />

          {/* Attachment button */}
          <div className="absolute right-10 bottom-2 flex items-center gap-1">
            <VoiceInput onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              aria-label="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={isGenerating ? onStop : handleSubmit}
            disabled={!isGenerating && !input.trim() && attachments.length === 0}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-colors"
            aria-label={isGenerating ? "Stop generation" : "Send message"}
          >
            {isGenerating ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {input.length > 0 && (() => {
          const tokens = Math.ceil(input.length / 4);
          const color = tokens < 2000 ? "text-green-600 dark:text-green-400"
            : tokens < 8000 ? "text-yellow-600 dark:text-yellow-400"
            : "text-red-600 dark:text-red-400";
          return (
            <div className={`mt-1 text-xs text-right ${color}`}>
              ~{tokens.toLocaleString()} tokens
            </div>
          );
        })()}
      </div>
    </div>
  );
}
