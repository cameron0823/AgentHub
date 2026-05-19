"use client";

import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  AtSign,
  Send,
  Square,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Languages,
  Maximize2,
  Minimize2,
  Wand2,
} from "lucide-react";
import { EDITOR_AI_COMPLETE_ACTIONS } from "@agenthub/editor-kernel/plugins/ai-complete";
import { trpc } from "@/lib/trpc";
import { findAgentMentionTrigger, formatAgentMentionToken, type MentionableAgent } from "@/lib/agent-mentions";
import {
  formatFileMentionToken,
  prepareBrowserFileSnapshot,
  prepareDesktopFileSnapshot,
  type FileSnapshot,
} from "@/lib/file-snapshots";
import { getDesktopRuntime } from "@/lib/desktop-runtime";
import { refinePrompt, type PromptRefinementMode } from "@/lib/prompt-refinement";
import { useChatStore } from "@/stores/chatStore";
import { VoiceInput } from "./VoiceInput";

const promptRefinementIcons: Record<PromptRefinementMode, typeof Wand2> = {
  rewrite: Wand2,
  translate: Languages,
  shorten: Minimize2,
  expand: Maximize2,
  media: ImageIcon,
};

const MAX_UPLOAD_FILES = 10;
const CLIENT_UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024,
};
const ALLOWED_UPLOAD_EXTENSIONS = new Set([".csv", ".doc", ".docx", ".json", ".md", ".pdf", ".txt"]);
const FORBIDDEN_UPLOAD_EXTENSIONS = new Set([".bat", ".cmd", ".com", ".dll", ".exe", ".msi", ".ps1", ".sh", ".so"]);

function fileExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function uploadCategoryForFile(file: File): keyof typeof CLIENT_UPLOAD_LIMITS {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function isAcceptedUploadType(file: File) {
  const extension = fileExtension(file.name);
  if (FORBIDDEN_UPLOAD_EXTENSIONS.has(extension)) return false;
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("text/") ||
    file.type.startsWith("video/") ||
    file.type === "application/pdf" ||
    file.type === "application/json" ||
    file.type === "application/msword" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ALLOWED_UPLOAD_EXTENSIONS.has(extension)
  );
}

function formatBytes(value: number) {
  return `${Math.round(value / 1024 / 1024)} MB`;
}

interface Attachment {
  file: File;
  url?: string;
  s3Key?: string;
  snapshot?: FileSnapshot;
  uploading: boolean;
}

export interface ChatFileAttachment {
  url: string;
  name: string;
  type: string;
  fileId?: string;
  s3Key?: string;
  snapshot?: FileSnapshot;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatFileAttachment[]) => void;
  onStop: () => void;
  isGenerating: boolean;
}

export function ChatInput({ onSend, onStop, isGenerating }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [agentMentionQuery, setAgentMentionQuery] = useState<string | null>(null);
  const [agentMentionStart, setAgentMentionStart] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [desktopFileAgentAvailable, setDesktopFileAgentAvailable] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeSessionId, sessions, agents } = useChatStore();
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const activeAgent = activeSession?.agentId ? agents.find((agent) => agent.id === activeSession.agentId) : undefined;
  const handsFreeVoice = Boolean(activeAgent?.handsFreeVoice);

  const agentList = trpc.agents.list.useQuery();
  const { data: slashResults } = trpc.promptLibrary.list.useQuery(
    { search: slashQuery ?? "" },
    { enabled: slashQuery !== null },
  );
  const agentMentionOptions = (agentList.data ?? [])
    .filter((agent) => {
      if (agentMentionQuery === null) return false;
      const query = agentMentionQuery.toLowerCase();
      return agent.name.toLowerCase().includes(query) || (agent.description ?? "").toLowerCase().includes(query);
    })
    .slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [agentMentionQuery]);

  useEffect(() => {
    const desktop = getDesktopRuntime();
    if (!desktop?.selectFileSnapshot) return;
    let cancelled = false;
    desktop
      .getRuntimeInfo()
      .then((info) => {
        if (!cancelled) setDesktopFileAgentAvailable(Boolean(info.capabilities?.fileSnapshots));
      })
      .catch(() => {
        if (!cancelled) setDesktopFileAgentAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resizeAndFocus = useCallback(() => {
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        textareaRef.current.focus();
      }
    }, 0);
  }, []);

  const insertPrompt = useCallback(
    (content: string) => {
      setInput(content);
      setSlashQuery(null);
      resizeAndFocus();
    },
    [resizeAndFocus],
  );

  const insertAgentMention = useCallback(
    (agent: MentionableAgent) => {
      const textarea = textareaRef.current;
      const cursor = textarea?.selectionStart ?? input.length;
      const start = agentMentionStart ?? cursor;
      const token = `${formatAgentMentionToken(agent)} `;
      const nextInput = `${input.slice(0, start)}${token}${input.slice(cursor)}`;
      const nextCursor = start + token.length;

      setInput(nextInput);
      setAgentMentionQuery(null);
      setAgentMentionStart(null);
      setSlashQuery(null);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
      }, 0);
    },
    [agentMentionStart, input],
  );

  const insertFileMention = useCallback(
    (snapshot: FileSnapshot) => {
      const token = formatFileMentionToken(snapshot);
      setInput((prev) => {
        if (prev.includes(`file:${snapshot.id}`)) return prev;
        const separator = prev.trim().length > 0 ? " " : "";
        return `${prev}${separator}${token}`;
      });
      setAgentMentionQuery(null);
      setAgentMentionStart(null);
      setSlashQuery(null);
      resizeAndFocus();
    },
    [resizeAndFocus],
  );

  const applyPromptRefinement = useCallback(
    (mode: PromptRefinementMode) => {
      if (!input.trim()) return;
      setInput(refinePrompt(input, mode));
      setSlashQuery(null);
      setAgentMentionQuery(null);
      setAgentMentionStart(null);
      resizeAndFocus();
    },
    [input, resizeAndFocus],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || attachments.some((a) => a.uploading) || isGenerating) return;

    const uploadedAttachments = attachments
      .filter((a) => !a.uploading && (a.url || a.snapshot?.source === "desktop_local"))
      .map((a) => ({
        url: a.url || "",
        name: a.file.name,
        type: a.file.type || a.snapshot?.mimeType || "application/octet-stream",
        fileId: a.snapshot?.id,
        s3Key: a.s3Key,
        snapshot: a.snapshot,
      }));

    onSend(trimmed, uploadedAttachments);
    setInput("");
    setAttachments([]);
    setUploadError(null);
    setSlashQuery(null);
    setAgentMentionQuery(null);
    setAgentMentionStart(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, attachments, isGenerating, onSend]);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const transcript = text.trim();
      if (!transcript) return;
      const hasUploadingAttachments = attachments.some((attachment) => attachment.uploading);
      const canAutoSend = handsFreeVoice && !isGenerating && attachments.length === 0 && !hasUploadingAttachments;

      if (canAutoSend) {
        onSend(transcript, []);
        setInput("");
        setSlashQuery(null);
        setAgentMentionQuery(null);
        setAgentMentionStart(null);
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
        return;
      }

      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setSlashQuery(null);
      setAgentMentionQuery(null);
      setAgentMentionStart(null);
      resizeAndFocus();
    },
    [attachments, handsFreeVoice, isGenerating, onSend, resizeAndFocus],
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (agentMentionQuery !== null && agentMentionOptions.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIndex((i) => Math.min(agentMentionOptions.length - 1, i + 1));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertAgentMention(agentMentionOptions[selectedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setAgentMentionQuery(null);
        setAgentMentionStart(null);
        return;
      }
    }

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

    const mentionTrigger = findAgentMentionTrigger(value, e.target.selectionStart ?? value.length);
    setAgentMentionQuery(mentionTrigger?.query ?? null);
    setAgentMentionStart(mentionTrigger?.start ?? null);

    if (value.startsWith("/")) {
      setSlashQuery(value.slice(1));
    } else {
      setSlashQuery(null);
    }
  };

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadError(null);

      const availableSlots = Math.max(0, MAX_UPLOAD_FILES - attachments.length);
      const acceptedFiles: File[] = [];
      const rejected: string[] = [];
      for (const file of files.slice(0, availableSlots)) {
        const category = uploadCategoryForFile(file);
        const limit = CLIENT_UPLOAD_LIMITS[category];
        if (!isAcceptedUploadType(file)) {
          rejected.push(`${file.name}: unsupported file type`);
        } else if (file.size > limit) {
          rejected.push(`${file.name}: ${category} limit is ${formatBytes(limit)}`);
        } else {
          acceptedFiles.push(file);
        }
      }
      if (files.length > availableSlots) {
        rejected.push(`Only ${MAX_UPLOAD_FILES} files can be attached at once`);
      }
      if (rejected.length > 0) setUploadError(rejected.join("; "));
      if (acceptedFiles.length === 0) return;

      const newAttachments: Attachment[] = await Promise.all(
        acceptedFiles.map(async (file) => ({
          file,
          snapshot: await prepareBrowserFileSnapshot(file),
          uploading: true,
        })),
      );

      setAttachments((prev) => [...prev, ...newAttachments]);

      for (const attachment of newAttachments) {
        try {
          const res = await fetch("/api/upload/presigned", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: attachment.file.name,
              contentType: attachment.file.type,
              size: attachment.file.size,
            }),
          });

          if (!res.ok) {
            let message = "Failed to get presigned URL";
            try {
              const payload = (await res.json()) as { error?: string };
              if (payload.error) message = payload.error;
            } catch {
              // Keep the default error.
            }
            throw new Error(message);
          }

          const { uploadUrl, s3Url, key, fileId } = await res.json();

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            body: attachment.file,
            headers: { "Content-Type": attachment.file.type },
          });

          if (!uploadRes.ok) throw new Error("Upload failed");
          const completeRes = await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileId,
              key,
              contentType: attachment.file.type,
              size: attachment.file.size,
            }),
          });

          if (!completeRes.ok) {
            let message = "Upload validation failed";
            try {
              const payload = (await completeRes.json()) as { error?: string };
              if (payload.error) message = payload.error;
            } catch {
              // Keep the default error.
            }
            throw new Error(message);
          }

          const completed = (await completeRes.json()) as {
            s3Url?: string;
            key?: string;
            fileId?: string;
            detectedMimeType?: string;
          };
          const completedUrl = completed.s3Url || s3Url || uploadUrl.split("?")[0];
          const completedKey = completed.key || key;
          const completedFileId = completed.fileId || fileId;
          const completedMimeType = completed.detectedMimeType || attachment.file.type;

          const uploadedSnapshot: FileSnapshot | undefined = attachment.snapshot
            ? {
                ...attachment.snapshot,
                id: typeof completedFileId === "string" ? completedFileId : attachment.snapshot.id,
                url: completedUrl,
                s3Key: completedKey,
                mimeType: completedMimeType || attachment.snapshot.mimeType,
              }
            : undefined;

          setAttachments((prev) =>
            prev.map((a) =>
              a.file === attachment.file
                ? { ...a, url: completedUrl, s3Key: completedKey, snapshot: uploadedSnapshot, uploading: false }
                : a,
            ),
          );
          if (uploadedSnapshot) insertFileMention(uploadedSnapshot);
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : "Upload failed");
          setAttachments((prev) => prev.filter((a) => a.file !== attachment.file));
        }
      }
    },
    [attachments.length, insertFileMention],
  );

  const handleDesktopFileSnapshot = useCallback(async () => {
    const desktop = getDesktopRuntime();
    if (!desktop?.selectFileSnapshot) {
      setUploadError("Desktop file agent is not available in this runtime.");
      return;
    }

    setUploadError(null);
    try {
      const result = await desktop.selectFileSnapshot();
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      if (!result.snapshot) return;

      const snapshot = prepareDesktopFileSnapshot(result.snapshot);
      const file = new File([], snapshot.name, { type: snapshot.mimeType });
      setAttachments((prev) => [...prev, { file, snapshot, uploading: false }]);
      insertFileMention(snapshot);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Desktop file snapshot failed");
    }
  }, [insertFileMention]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(Array.from(files));
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isGenerating) return;
    void processFiles(Array.from(e.dataTransfer.files));
  };

  const removeAttachment = (file: File) => {
    setAttachments((prev) => prev.filter((a) => a.file !== file));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="px-0 pb-1 pt-1" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="mx-auto max-w-4xl">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att) => (
              <div
                key={`${att.snapshot?.id ?? att.file.name}-${att.file.name}`}
                data-testid="file-mention-chip"
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-2 py-1 text-xs text-slate-200"
              >
                {getFileIcon(att.file.type)}
                <span className="max-w-[120px] truncate">{att.file.name}</span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">Snapshot</span>
                {att.snapshot?.source === "desktop_local" && (
                  <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200">Desktop</span>
                )}
                {att.snapshot?.contentPreview && (
                  <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200">
                    Preview captured
                  </span>
                )}
                {att.file.type.startsWith("image/") && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                    Image analysis
                  </span>
                )}
                {att.uploading && <span className="text-muted-foreground">uploading...</span>}
                <button onClick={() => removeAttachment(att.file)} className="rounded p-0.5 hover:bg-white/10">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploadError && (
          <div className="mb-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {uploadError}
          </div>
        )}

        <div className="relative">
          {agentMentionQuery !== null && agentMentionOptions.length > 0 && (
            <div
              data-testid="agent-mention-menu"
              className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-xl"
            >
              {agentMentionOptions.map((agent, i) => (
                <button
                  key={agent.id}
                  data-testid="agent-mention-option"
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === selectedMentionIndex ? "bg-primary/20 text-white" : "hover:bg-white/10"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertAgentMention(agent);
                  }}
                  onMouseEnter={() => setSelectedMentionIndex(i)}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <AtSign className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{agent.name}</span>
                    {agent.description && (
                      <span className="block truncate text-xs text-muted-foreground">{agent.description}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Slash command popover */}
          {agentMentionQuery === null && slashQuery !== null && slashResults && slashResults.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-xl">
              {slashResults.slice(0, 8).map((prompt, i) => (
                <button
                  key={prompt.id}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                    i === selectedIndex ? "bg-primary/20 text-white" : "hover:bg-white/10"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertPrompt(prompt.content);
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="font-medium truncate">{prompt.title}</span>
                  {prompt.tags && prompt.tags.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{prompt.tags[0]}</span>
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
            placeholder="Message your local AI... (type / for prompts, @ for agents)"
            disabled={isGenerating}
            rows={1}
            className="w-full resize-none rounded-[1.65rem] border border-white/16 bg-white/12 px-12 py-4 pr-24 text-base text-white shadow-inner shadow-black/20 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50"
            style={{ minHeight: "58px", maxHeight: "200px" }}
          />

          {/* Attachment button */}
          <div className="absolute bottom-2 left-2">
            <VoiceInput
              onTranscript={handleVoiceTranscript}
              continuous={handsFreeVoice}
              disabled={isGenerating || attachments.some((attachment) => attachment.uploading)}
            />
          </div>
          <div className="absolute right-12 bottom-2 flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className="rounded-full p-2 text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              aria-label="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            {desktopFileAgentAvailable && (
              <button
                data-testid="desktop-file-agent-button"
                onClick={handleDesktopFileSnapshot}
                disabled={isGenerating}
                className="rounded-full p-2 text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                aria-label="Capture desktop file snapshot"
                title="Capture desktop file snapshot"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,text/*,.csv,.doc,.docx,.json,.md,.pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={isGenerating ? onStop : handleSubmit}
            disabled={
              !isGenerating && ((!input.trim() && attachments.length === 0) || attachments.some((a) => a.uploading))
            }
            className="agenthub-primary-button absolute bottom-2 right-2 rounded-full p-2.5 transition-colors disabled:opacity-50"
            aria-label={isGenerating ? "Stop generation" : "Send message"}
          >
            {isGenerating ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {input.trim().length > 0 && !isGenerating && (
          <div data-testid="prompt-refinement-actions" className="mt-2 flex flex-wrap justify-end gap-1">
            {EDITOR_AI_COMPLETE_ACTIONS.map((action) => {
              const Icon = promptRefinementIcons[action.mode];
              return (
                <button
                  key={action.mode}
                  type="button"
                  onClick={() => applyPromptRefinement(action.mode)}
                  className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  title={action.label}
                  aria-label={action.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        )}
        {input.length > 0 &&
          (() => {
            const tokens = Math.ceil(input.length / 4);
            const color =
              tokens < 2000
                ? "text-green-600 dark:text-green-400"
                : tokens < 8000
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400";
            return <div className={`mt-1 text-xs text-right ${color}`}>~{tokens.toLocaleString()} tokens</div>;
          })()}
      </div>
    </div>
  );
}
