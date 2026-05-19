"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $getSelection, $isRangeSelection, type EditorState } from "lexical";
import { MessageSquarePlus, Sparkles } from "lucide-react";
import {
  exportEditorRootToMarkdown,
  importMarkdownToEditorRoot,
  MARKDOWN_TRANSFORMERS,
  readEditorPlainText,
} from "../plugins/markdown";

export type PageSelectionAction = "comment" | "rewrite-selection";

export interface PageEditorSelection {
  action: PageSelectionAction;
  selectedText: string;
}

interface PageEditorKernelProps {
  pageId?: string;
  markdown: string;
  onMarkdownChange?: (markdown: string, lexicalState: Record<string, unknown>, plainText: string) => void;
  onSelectionAction?: (selection: PageEditorSelection) => void;
}

function InitialMarkdownPlugin({ markdown, pageId }: { markdown: string; pageId?: string }) {
  const [editor] = useLexicalComposerContext();
  const loadedKeyRef = useRef<string | undefined>();

  useEffect(() => {
    const loadKey = pageId ?? "draft";
    if (loadedKeyRef.current === loadKey) return;
    editor.update(() => {
      importMarkdownToEditorRoot(markdown);
    });
    loadedKeyRef.current = loadKey;
  }, [editor, markdown, pageId]);

  return null;
}

function MarkdownChangePlugin({ onMarkdownChange }: Pick<PageEditorKernelProps, "onMarkdownChange">) {
  return (
    <OnChangePlugin
      onChange={(editorState: EditorState) => {
        if (!onMarkdownChange) return;
        editorState.read(() => {
          onMarkdownChange(
            exportEditorRootToMarkdown(),
            editorState.toJSON() as unknown as Record<string, unknown>,
            readEditorPlainText(),
          );
        });
      }}
    />
  );
}

function SelectionActionsPlugin({ onSelectionAction }: Pick<PageEditorKernelProps, "onSelectionAction">) {
  const [editor] = useLexicalComposerContext();
  const runSelectionAction = useCallback(
    (action: PageSelectionAction) => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const selectedText = $isRangeSelection(selection) ? selection.getTextContent() : "";
        onSelectionAction?.({ action, selectedText });
      });
    },
    [editor, onSelectionAction],
  );

  return (
    <div className="flex flex-wrap gap-2 border-b border-white/10 px-3 py-2">
      <button
        type="button"
        onClick={() => runSelectionAction("rewrite-selection")}
        className="agenthub-secondary-button inline-flex items-center gap-1.5 px-2 py-1 text-xs"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Rewrite selection
      </button>
      <button
        type="button"
        onClick={() => runSelectionAction("comment")}
        className="agenthub-secondary-button inline-flex items-center gap-1.5 px-2 py-1 text-xs"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        Add comment
      </button>
    </div>
  );
}

export function PageEditorKernel({ pageId, markdown, onMarkdownChange, onSelectionAction }: PageEditorKernelProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: `agenthub-page-${pageId ?? "draft"}`,
      nodes: [CodeNode, HeadingNode, LinkNode, ListItemNode, ListNode, QuoteNode],
      theme: {
        paragraph: "mb-2",
        text: {
          bold: "font-semibold",
          italic: "italic",
          underline: "underline",
        },
      },
      onError(error: Error) {
        console.error(error);
      },
    }),
    [pageId],
  );

  return (
    <div data-testid="page-editor-kernel" className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <LexicalComposer initialConfig={initialConfig}>
        <SelectionActionsPlugin onSelectionAction={onSelectionAction} />
        <div className="relative min-h-[28rem]">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Page content editor"
                className="min-h-[28rem] px-4 py-4 text-sm leading-6 text-foreground outline-none"
              />
            }
            placeholder={
              <div className="pointer-events-none absolute left-4 top-4 text-sm text-muted-foreground">
                Start drafting...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
          <InitialMarkdownPlugin markdown={markdown} pageId={pageId} />
          <MarkdownChangePlugin onMarkdownChange={onMarkdownChange} />
        </div>
      </LexicalComposer>
    </div>
  );
}
