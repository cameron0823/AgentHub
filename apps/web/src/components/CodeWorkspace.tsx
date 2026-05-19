"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Copy, FileCode2, Play, Plus, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <textarea
      disabled
      className="h-full w-full resize-none bg-slate-950 p-4 font-mono text-sm text-slate-300"
      value="Loading editor..."
    />
  ),
});

type CodeLanguage = "python" | "javascript" | "typescript" | "json" | "markdown";

interface CodeFile {
  id: string;
  name: string;
  language: CodeLanguage;
  code: string;
}

const STORAGE_KEY = "agenthub-code-workspace";

const starterFiles: CodeFile[] = [
  {
    id: "scratch.py",
    name: "scratch.py",
    language: "python",
    code: 'print("Hello from AgentHub")\n',
  },
];

const languageExtensions: Record<CodeLanguage, string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  json: "json",
  markdown: "md",
};

function nextFileName(language: CodeLanguage, count: number) {
  return `scratch-${count + 1}.${languageExtensions[language]}`;
}

export function CodeWorkspace() {
  const [files, setFiles] = useState<CodeFile[]>(starterFiles);
  const [activeFileId, setActiveFileId] = useState(starterFiles[0].id);
  const [newLanguage, setNewLanguage] = useState<CodeLanguage>("python");
  const executeCode = trpc.sandbox.executeCode.useMutation();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { files?: CodeFile[]; activeFileId?: string };
      if (!Array.isArray(parsed.files) || parsed.files.length === 0) return;
      setFiles(parsed.files);
      setActiveFileId(
        parsed.activeFileId && parsed.files.some((file) => file.id === parsed.activeFileId)
          ? parsed.activeFileId
          : parsed.files[0].id,
      );
    } catch {
      // Ignore corrupt browser drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, activeFileId }));
  }, [activeFileId, files]);

  const activeFile = useMemo(() => files.find((file) => file.id === activeFileId) ?? files[0], [activeFileId, files]);

  const updateActiveFile = (updates: Partial<CodeFile>) => {
    if (!activeFile) return;
    setFiles((current) => current.map((file) => (file.id === activeFile.id ? { ...file, ...updates } : file)));
  };

  const addFile = () => {
    const name = nextFileName(newLanguage, files.length);
    const file: CodeFile = { id: `${Date.now()}-${name}`, name, language: newLanguage, code: "" };
    setFiles((current) => [...current, file]);
    setActiveFileId(file.id);
  };

  const deleteActiveFile = () => {
    if (!activeFile || files.length <= 1) return;
    const remaining = files.filter((file) => file.id !== activeFile.id);
    setFiles(remaining);
    setActiveFileId(remaining[0].id);
  };

  const copyCode = () => {
    if (!activeFile) return;
    void navigator.clipboard.writeText(activeFile.code);
  };

  const formatJson = () => {
    if (!activeFile || activeFile.language !== "json") return;
    try {
      updateActiveFile({ code: `${JSON.stringify(JSON.parse(activeFile.code), null, 2)}\n` });
    } catch {
      // Invalid JSON stays untouched.
    }
  };

  const runCode = () => {
    if (!activeFile || activeFile.language !== "python") return;
    executeCode.mutate({ code: activeFile.code, language: "python" });
  };

  return (
    <main data-testid="monaco-code-workspace" className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Code Workspace</h1>
            <p className="truncate text-xs text-muted-foreground">{activeFile?.name ?? "No file"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newLanguage}
            onChange={(event) => setNewLanguage(event.target.value as CodeLanguage)}
            className="agenthub-field px-2 py-1.5 text-xs"
            aria-label="New file language"
          >
            {Object.keys(languageExtensions).map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <button type="button" onClick={addFile} className="agenthub-secondary-button px-2 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New file
          </button>
          <button type="button" onClick={copyCode} className="agenthub-secondary-button px-2 py-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          {activeFile?.language === "json" && (
            <button type="button" onClick={formatJson} className="agenthub-secondary-button px-2 py-1.5 text-xs">
              <Save className="h-3.5 w-3.5" />
              Format
            </button>
          )}
          <button
            type="button"
            onClick={runCode}
            disabled={activeFile?.language !== "python" || executeCode.isPending}
            className="agenthub-primary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Run Python
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-white/10 bg-white/[0.03] p-2 md:w-60 md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto md:block md:space-y-1">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setActiveFileId(file.id)}
                className={`block min-w-36 rounded-md px-2 py-1.5 text-left text-xs md:w-full ${
                  file.id === activeFile?.id ? "bg-primary/15 text-primary" : "hover:bg-white/10"
                }`}
              >
                <span className="block truncate font-medium">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">{file.language}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={deleteActiveFile}
            disabled={files.length <= 1}
            className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete file
          </button>
        </aside>

        <section className="min-h-0 min-w-0 flex-1">
          {activeFile && (
            <MonacoEditor
              data-testid="monaco-editor"
              height="100%"
              theme="vs-dark"
              language={activeFile.language}
              path={activeFile.name}
              value={activeFile.code}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              onChange={(value) => updateActiveFile({ code: value ?? "" })}
            />
          )}
        </section>

        <aside className="h-56 shrink-0 overflow-auto border-t border-white/10 bg-black/20 p-3 md:h-auto md:w-80 md:border-l md:border-t-0">
          <h2 className="mb-2 text-sm font-semibold">Run output</h2>
          {executeCode.isPending ? (
            <p className="text-xs text-muted-foreground">Running...</p>
          ) : executeCode.data ? (
            <div className="space-y-2 text-xs">
              <div className="text-muted-foreground">exit code: {executeCode.data.exitCode ?? 0}</div>
              {executeCode.data.stdout && (
                <pre className="whitespace-pre-wrap rounded-md bg-black/30 p-2">{executeCode.data.stdout}</pre>
              )}
              {executeCode.data.stderr && (
                <pre className="whitespace-pre-wrap rounded-md bg-red-950/30 p-2 text-red-200">
                  {executeCode.data.stderr}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Python runs use the same sandbox policy as agent tools.</p>
          )}
          {executeCode.isError && <p className="mt-2 text-xs text-destructive">{executeCode.error.message}</p>}
        </aside>
      </div>
    </main>
  );
}
