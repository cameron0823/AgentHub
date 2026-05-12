"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useState, useRef, useCallback } from "react";
import { Send, Square, Paperclip, X, FileText, Image } from "lucide-react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;

    const uploadedAttachments = attachments
      .filter((a) => a.url && !a.uploading)
      .map((a) => ({ url: a.url!, name: a.file.name, type: a.file.type }));

    onSend(trimmed, uploadedAttachments);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachments, isGenerating, onSend]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
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
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message your local AI..."
            disabled={isGenerating}
            rows={1}
            className="w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            style={{ minHeight: "48px", maxHeight: "200px" }}
          />

          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            className="absolute right-10 bottom-2 p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

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
      </div>
    </div>
  );
}
