"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, MessageSquarePlus, Plus, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { PageEditorKernel, type PageEditorSelection } from "@agenthub/editor-kernel";
import { trpc } from "@/lib/trpc";

type PageRecord = {
  id: string;
  title: string;
  markdown: string;
  lexicalState?: unknown;
  lastEditedBy?: "human" | "agent" | "system";
  updatedAt?: Date | string | null;
};

const DEFAULT_MARKDOWN = "# Untitled Page\n\nStart drafting from chat, notes, or agent output.";

function downloadMarkdown(title: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  }.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PagesManager() {
  const utils = trpc.useUtils();
  const pagesQuery = trpc.pages.list.useQuery();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState(DEFAULT_MARKDOWN);
  const [draftLexicalState, setDraftLexicalState] = useState<Record<string, unknown> | undefined>();
  const [importMarkdownText, setImportMarkdownText] = useState("");
  const [copilotInstruction, setCopilotInstruction] = useState(
    "Improve this working document with the current context.",
  );
  const [copilotAction, setCopilotAction] = useState<"append" | "prepend" | "replace-selection">("append");
  const [commentBody, setCommentBody] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [compareFromVersion, setCompareFromVersion] = useState<number | null>(null);
  const [compareToVersion, setCompareToVersion] = useState<number | null>(null);

  const pages = useMemo(() => (pagesQuery.data ?? []) as PageRecord[], [pagesQuery.data]);
  const activePage = pages.find((page) => page.id === selectedPageId) ?? pages[0];

  useEffect(() => {
    if (!selectedPageId && pages[0]) setSelectedPageId(pages[0].id);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (!activePage) return;
    setDraftTitle(activePage.title);
    setDraftMarkdown(activePage.markdown || "");
    setDraftLexicalState(
      activePage.lexicalState && typeof activePage.lexicalState === "object"
        ? (activePage.lexicalState as Record<string, unknown>)
        : undefined,
    );
    setImportMarkdownText(activePage.markdown || "");
  }, [activePage]);

  const refreshPages = () => {
    void utils.pages.list.invalidate();
    if (activePage?.id) {
      void utils.pages.comments.invalidate({ pageId: activePage.id });
      void utils.pages.versions.invalidate({ pageId: activePage.id });
    }
  };

  const commentsQuery = trpc.pages.comments.useQuery(
    { pageId: activePage?.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activePage?.id) },
  );
  const versionsQuery = trpc.pages.versions.useQuery(
    { pageId: activePage?.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activePage?.id) },
  );
  const compareVersions = trpc.pages.compareVersions.useQuery(
    {
      pageId: activePage?.id ?? "00000000-0000-0000-0000-000000000000",
      fromVersion: compareFromVersion ?? 1,
      toVersion: compareToVersion ?? 1,
    },
    {
      enabled: Boolean(
        activePage?.id && compareFromVersion && compareToVersion && compareFromVersion !== compareToVersion,
      ),
    },
  );
  const createPage = trpc.pages.create.useMutation({
    onSuccess: (page) => {
      refreshPages();
      setSelectedPageId(page.id);
    },
  });
  const updatePage = trpc.pages.update.useMutation({ onSuccess: refreshPages });
  const deletePage = trpc.pages.delete.useMutation({
    onSuccess: () => {
      setSelectedPageId(null);
      refreshPages();
    },
  });
  const importMarkdown = trpc.pages.importMarkdown.useMutation({
    onSuccess: (page) => {
      setDraftMarkdown(page.markdown);
      setDraftTitle(page.title);
      refreshPages();
    },
  });
  const applyCopilotEdit = trpc.pages.applyCopilotEdit.useMutation({
    onSuccess: (page) => {
      setDraftMarkdown(page.markdown);
      setDraftTitle(page.title);
      refreshPages();
    },
  });
  const addComment = trpc.pages.addComment.useMutation({
    onSuccess: () => {
      setCommentBody("");
      refreshPages();
    },
  });
  const restoreVersion = trpc.pages.restoreVersion.useMutation({
    onSuccess: (page) => {
      setDraftMarkdown(page.markdown);
      setDraftTitle(page.title);
      refreshPages();
    },
  });

  const handleSelectionAction = (selection: PageEditorSelection) => {
    setSelectedText(selection.selectedText);
    if (selection.action === "rewrite-selection") {
      setCopilotAction(selection.selectedText ? "replace-selection" : "append");
      setCopilotInstruction(
        selection.selectedText ? `Rewrite selected text: ${selection.selectedText}` : "Improve this working document.",
      );
    } else {
      setCommentBody(selection.selectedText ? `Review: ${selection.selectedText}` : "");
    }
  };

  const savePage = () => {
    if (!activePage) return;
    updatePage.mutate({
      id: activePage.id,
      title: draftTitle || "Untitled Page",
      markdown: draftMarkdown,
      lexicalState: draftLexicalState,
    });
  };

  return (
    <main data-testid="pages-manager" className="flex h-screen bg-background text-foreground">
      <aside className="w-72 shrink-0 border-r border-white/10 bg-white/[0.03] p-3">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold">Pages</h1>
          <button
            type="button"
            onClick={() => createPage.mutate({ title: "Untitled Page", markdown: DEFAULT_MARKDOWN })}
            className="agenthub-primary-button inline-flex items-center gap-1.5 px-2 py-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Page
          </button>
        </div>
        <div className="space-y-1">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setSelectedPageId(page.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                page.id === activePage?.id ? "bg-primary/15 text-primary" : "hover:bg-white/10"
              }`}
            >
              <span className="block truncate font-medium">{page.title}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                {page.lastEditedBy === "agent" ? "Agent edited" : "Human edited"}
              </span>
            </button>
          ))}
          {pages.length === 0 && (
            <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-muted-foreground">
              No pages yet.
            </p>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
            placeholder="Untitled Page"
          />
          <button
            type="button"
            onClick={savePage}
            disabled={!activePage || updatePage.isPending}
            className="agenthub-primary-button inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => downloadMarkdown(draftTitle || "page", draftMarkdown)}
            disabled={!activePage}
            className="agenthub-secondary-button inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <Download className="h-4 w-4" />
            Export Markdown
          </button>
          <button
            type="button"
            onClick={() => activePage && deletePage.mutate({ id: activePage.id })}
            disabled={!activePage}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-destructive disabled:opacity-50"
            title="Delete page"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {activePage ? (
            <PageEditorKernel
              pageId={activePage.id}
              markdown={draftMarkdown}
              onMarkdownChange={(markdown, lexicalState) => {
                setDraftMarkdown(markdown);
                setDraftLexicalState(lexicalState);
              }}
              onSelectionAction={handleSelectionAction}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Create a page to start writing.
            </div>
          )}
        </div>
      </section>

      <aside className="w-80 shrink-0 space-y-4 border-l border-white/10 bg-white/[0.03] p-3">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Page Agent Copilot
          </h2>
          <textarea
            value={copilotInstruction}
            onChange={(event) => setCopilotInstruction(event.target.value)}
            className="agenthub-field min-h-20 w-full px-3 py-2 text-sm"
          />
          <select
            value={copilotAction}
            onChange={(event) => setCopilotAction(event.target.value as typeof copilotAction)}
            className="agenthub-field w-full px-3 py-2 text-sm"
          >
            <option value="append">Append</option>
            <option value="prepend">Prepend</option>
            <option value="replace-selection">Replace selection</option>
          </select>
          <button
            type="button"
            disabled={!activePage || !copilotInstruction.trim() || applyCopilotEdit.isPending}
            onClick={() =>
              activePage &&
              applyCopilotEdit.mutate({
                pageId: activePage.id,
                instruction: copilotInstruction,
                action: copilotAction,
              })
            }
            className="agenthub-primary-button w-full px-3 py-2 text-sm"
          >
            Apply copilot edit
          </button>
          {selectedText && (
            <p className="line-clamp-3 rounded-md bg-white/5 p-2 text-xs text-muted-foreground">{selectedText}</p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Upload className="h-4 w-4" />
            Import Markdown
          </h2>
          <textarea
            value={importMarkdownText}
            onChange={(event) => setImportMarkdownText(event.target.value)}
            className="agenthub-field min-h-24 w-full px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            disabled={!activePage || importMarkdown.isPending}
            onClick={() => activePage && importMarkdown.mutate({ pageId: activePage.id, markdown: importMarkdownText })}
            className="agenthub-secondary-button w-full px-3 py-2 text-sm"
          >
            Import Markdown
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquarePlus className="h-4 w-4" />
            Comments
          </h2>
          <textarea
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            className="agenthub-field min-h-20 w-full px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!activePage || !commentBody.trim() || addComment.isPending}
            onClick={() =>
              activePage &&
              addComment.mutate({ pageId: activePage.id, body: commentBody, quotedText: selectedText || undefined })
            }
            className="agenthub-secondary-button w-full px-3 py-2 text-sm"
          >
            Add comment
          </button>
          <div className="space-y-2">
            {(commentsQuery.data ?? []).map((comment) => (
              <article key={comment.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                {comment.quotedText && <p className="mb-1 line-clamp-2 text-muted-foreground">{comment.quotedText}</p>}
                <p>{comment.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Edit history</h2>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={compareFromVersion ?? ""}
              onChange={(event) => setCompareFromVersion(event.target.value ? Number(event.target.value) : null)}
              className="agenthub-field px-2 py-1 text-xs"
            >
              <option value="">From</option>
              {(versionsQuery.data ?? []).map((version) => (
                <option key={version.id} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
            <select
              value={compareToVersion ?? ""}
              onChange={(event) => setCompareToVersion(event.target.value ? Number(event.target.value) : null)}
              className="agenthub-field px-2 py-1 text-xs"
            >
              <option value="">To</option>
              {(versionsQuery.data ?? []).map((version) => (
                <option key={version.id} value={version.versionNumber}>
                  v{version.versionNumber}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="agenthub-secondary-button w-full px-3 py-2 text-sm"
            disabled={!compareVersions.data}
          >
            Compare versions
          </button>
          {compareVersions.data && (
            <p className="rounded-md bg-white/5 p-2 text-xs text-muted-foreground">
              +{compareVersions.data.diffSummary.addedLines} / -{compareVersions.data.diffSummary.removedLines}
            </p>
          )}
          <div className="space-y-2">
            {(versionsQuery.data ?? []).map((version) => (
              <article key={version.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      Version {version.versionNumber} · {version.sourceType}
                    </div>
                    <div className="text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      activePage && restoreVersion.mutate({ pageId: activePage.id, versionId: version.id })
                    }
                    className="rounded-md border border-white/10 px-2 py-1 text-[11px] hover:bg-white/10"
                  >
                    Restore version
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}
