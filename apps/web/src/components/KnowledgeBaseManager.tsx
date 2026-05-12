"use client";

import { useRef, useState } from "react";
import { FolderOpen, Plus, Trash2, FileText, Loader2, Search, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function KnowledgeBaseManager() {
  const [selectedKb, setSelectedKb] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [query, setQuery] = useState("");
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const kbs = trpc.knowledgeBases.list.useQuery();
  const createKb = trpc.knowledgeBases.create.useMutation({
    onSuccess: () => {
      utils.knowledgeBases.list.invalidate();
      setShowCreate(false);
      setNewKbName("");
    },
  });
  const deleteKb = trpc.knowledgeBases.delete.useMutation({
    onSuccess: () => utils.knowledgeBases.list.invalidate(),
  });
  const documents = trpc.knowledgeBases.documents.useQuery(
    { knowledgeBaseId: selectedKb! },
    { enabled: !!selectedKb }
  );
  const createDocument = trpc.knowledgeBases.createDocument.useMutation({
    onSuccess: () => {
      utils.knowledgeBases.documents.invalidate({ knowledgeBaseId: selectedKb! });
    },
  });
  const ingestDocument = trpc.knowledgeBases.ingestDocument.useMutation({
    onSuccess: () => {
      utils.knowledgeBases.documents.invalidate({ knowledgeBaseId: selectedKb! });
    },
  });
  const deleteDocument = trpc.knowledgeBases.deleteDocument.useMutation({
    onSuccess: () => {
      utils.knowledgeBases.documents.invalidate({ knowledgeBaseId: selectedKb! });
    },
  });
  const kbQuery = trpc.knowledgeBases.query.useMutation({
    onSuccess: (data) => setQueryResults(data),
  });

  const activeKb = kbs.data?.find((k) => k.id === selectedKb);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedKb) return;

    setUploading(true);
    try {
      // 1. Get presigned upload URL
      const presignedRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      if (!presignedRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, s3Url, key } = await presignedRes.json();

      // 2. Upload file to MinIO
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");

      // 3. Read file content for text files
      let content: string | undefined;
      if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
        content = await file.text();
      }

      // 4. Create document record
      const doc = await createDocument.mutateAsync({
        knowledgeBaseId: selectedKb,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        s3Key: key,
        s3Url,
        content,
      });

      // 5. Trigger ingest
      await ingestDocument.mutateAsync({ documentId: doc.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="w-6 h-6" />
          Knowledge Bases
        </h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm"
        >
          <Plus className="w-4 h-4" />
          New KB
        </button>
      </div>

      {showCreate && (
        <div className="border rounded-lg p-4 mb-6 space-y-3">
          <input
            value={newKbName}
            onChange={(e) => setNewKbName(e.target.value)}
            placeholder="Knowledge base name"
            className="w-full px-3 py-2 border rounded-md"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createKb.mutate({ name: newKbName })}
              disabled={!newKbName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
            >
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-md text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* KB List */}
        <div className="col-span-1 space-y-2">
          {kbs.data?.map((kb) => (
            <div
              key={kb.id}
              onClick={() => { setSelectedKb(kb.id); setQueryResults([]); }}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedKb === kb.id ? "bg-primary/10 border-primary" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{kb.name}</div>
              <div className="text-xs text-muted-foreground">
                {kb.embeddingModel} · {kb.chunkSize} chars
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteKb.mutate({ id: kb.id });
                }}
                className="mt-2 text-xs text-destructive hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {/* KB Details */}
        <div className="col-span-2 space-y-4">
          {activeKb ? (
            <>
              <div className="border rounded-lg p-4">
                <h2 className="font-semibold mb-2">{activeKb.name}</h2>
                <div className="text-sm text-muted-foreground mb-4">
                  Embedding: {activeKb.embeddingModel} · Chunk size: {activeKb.chunkSize} · Overlap: {activeKb.chunkOverlap}
                </div>

                {/* Query */}
                <div className="flex gap-2 mb-4">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search this knowledge base..."
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") kbQuery.mutate({ knowledgeBaseId: activeKb.id, query });
                    }}
                  />
                  <button
                    onClick={() => kbQuery.mutate({ knowledgeBaseId: activeKb.id, query })}
                    disabled={!query.trim() || kbQuery.isPending}
                    className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
                  >
                    {kbQuery.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>

                {/* Query Results */}
                {queryResults.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="text-xs font-semibold text-muted-foreground">Search Results</div>
                    {queryResults.map((result) => (
                      <div key={result.id} className="p-2 rounded bg-muted/50 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">Similarity: {(result.similarity * 100).toFixed(1)}%</div>
                        <div className="line-clamp-3">{result.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload */}
                <div className="flex items-center gap-2 mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? "Uploading..." : "Upload Document"}
                  </button>
                </div>

                {/* Documents */}
                <div className="text-xs font-semibold text-muted-foreground mb-2">Documents</div>
                {documents.data?.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                    No documents yet. Upload files to get started.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {documents.data?.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{doc.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          doc.status === "indexed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                          doc.status === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                          doc.status === "error" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        }`}>
                          {doc.status}
                        </span>
                        <button
                          onClick={() => deleteDocument.mutate({ id: doc.id })}
                          className="p-1 hover:text-destructive"
                          title="Delete document"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-muted-foreground py-12 border rounded-lg">
              Select a knowledge base to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
