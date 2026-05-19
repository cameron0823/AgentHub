"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Folder, Link, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ScopedItem = {
  id: string;
  name?: string | null;
  title?: string | null;
  prompt?: string | null;
  uri?: string | null;
};

const RESOURCE_KINDS = [
  { value: "agent", label: "Agent" },
  { value: "chat", label: "Chat" },
  { value: "page", label: "Page" },
  { value: "knowledgeBase", label: "KB" },
  { value: "task", label: "Task" },
  { value: "automation", label: "Schedule" },
  { value: "resource", label: "Resource" },
] as const;

function itemLabel(item: ScopedItem) {
  return item.name || item.title || item.prompt || item.uri || item.id;
}

export function ProjectsManager() {
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projects.list.useQuery();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("New Project");
  const [projectDescription, setProjectDescription] = useState("");
  const [linkKind, setLinkKind] = useState<(typeof RESOURCE_KINDS)[number]["value"]>("chat");
  const [linkResourceId, setLinkResourceId] = useState("");
  const [notebookTitle, setNotebookTitle] = useState("Project note");
  const [notebookContent, setNotebookContent] = useState("");
  const [notebookQuery, setNotebookQuery] = useState("");

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  useEffect(() => {
    if (!activeProjectId && projects[0]) setActiveProjectId(projects[0].id);
  }, [projects, activeProjectId]);

  const scopeQuery = trpc.projects.scope.useQuery(
    { projectId: activeProject?.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activeProject?.id) },
  );
  const notebookDocs = trpc.projects.notebookDocuments.useQuery(
    { projectId: activeProject?.id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(activeProject?.id) },
  );
  const notebookSearch = trpc.projects.searchNotebookDocuments.useQuery(
    { projectId: activeProject?.id ?? "00000000-0000-0000-0000-000000000000", query: notebookQuery || " " },
    { enabled: Boolean(activeProject?.id && notebookQuery.trim()) },
  );

  const invalidateActiveProject = () => {
    void utils.projects.list.invalidate();
    if (activeProject?.id) {
      void utils.projects.scope.invalidate({ projectId: activeProject.id });
      void utils.projects.notebookDocuments.invalidate({ projectId: activeProject.id });
    }
  };

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      setActiveProjectId(project.id);
      invalidateActiveProject();
    },
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      setActiveProjectId(null);
      invalidateActiveProject();
    },
  });
  const linkResource = trpc.projects.linkResource.useMutation({
    onSuccess: () => {
      setLinkResourceId("");
      invalidateActiveProject();
    },
  });
  const createNotebookDocument = trpc.projects.createNotebookDocument.useMutation({
    onSuccess: () => {
      setNotebookContent("");
      invalidateActiveProject();
    },
  });
  const deleteNotebookDocument = trpc.projects.deleteNotebookDocument.useMutation({
    onSuccess: invalidateActiveProject,
  });

  const scopeGroups = [
    { label: "Agents", items: (scopeQuery.data?.agents ?? []) as ScopedItem[] },
    { label: "Chats", items: (scopeQuery.data?.chats ?? []) as ScopedItem[] },
    { label: "Pages", items: (scopeQuery.data?.pages ?? []) as ScopedItem[] },
    { label: "KBs", items: (scopeQuery.data?.knowledgeBases ?? []) as ScopedItem[] },
    { label: "Tasks", items: (scopeQuery.data?.tasks ?? []) as ScopedItem[] },
    { label: "Schedules", items: (scopeQuery.data?.automations ?? []) as ScopedItem[] },
    { label: "Resources", items: (scopeQuery.data?.resources ?? []) as ScopedItem[] },
  ];
  const visibleNotebookDocs = notebookQuery.trim() ? (notebookSearch.data ?? []) : (notebookDocs.data ?? []);

  return (
    <main
      data-testid="projects-manager"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground lg:flex-row"
    >
      <aside className="max-h-72 w-full shrink-0 overflow-y-auto border-b border-white/10 bg-white/[0.03] p-3 lg:h-auto lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <Folder className="h-4 w-4 text-primary" />
            Projects
          </h1>
          <button
            type="button"
            onClick={() => createProject.mutate({ name: projectName, description: projectDescription || undefined })}
            className="agenthub-primary-button inline-flex items-center gap-1.5 px-2 py-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New Project
          </button>
        </div>
        <div className="space-y-2">
          <input
            aria-label="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <textarea
            aria-label="Project description"
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            className="agenthub-field min-h-16 w-full px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4 space-y-1">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveProjectId(project.id)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                project.id === activeProject?.id ? "bg-primary/15 text-primary" : "hover:bg-white/10"
              }`}
            >
              <span className="block truncate font-medium">{project.name}</span>
              {project.description && (
                <span className="block truncate text-[11px] text-muted-foreground">{project.description}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <section className="min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-4">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{activeProject?.name ?? "Projects"}</h2>
            {activeProject?.description && <p className="text-sm text-muted-foreground">{activeProject.description}</p>}
          </div>
          <button
            type="button"
            disabled={!activeProject}
            onClick={() => activeProject && deleteProject.mutate({ id: activeProject.id })}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/10 hover:text-destructive disabled:opacity-50"
            title="Delete project"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </header>

        <section className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Link className="h-4 w-4" />
            Link resource
          </h2>
          <div className="grid gap-2 md:grid-cols-[12rem_1fr_auto]">
            <select
              aria-label="Resource kind"
              value={linkKind}
              onChange={(event) => setLinkKind(event.target.value as typeof linkKind)}
              className="agenthub-field px-3 py-2 text-sm"
            >
              {RESOURCE_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Resource UUID"
              value={linkResourceId}
              onChange={(event) => setLinkResourceId(event.target.value)}
              placeholder="Resource UUID"
              className="agenthub-field px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!activeProject || !linkResourceId.trim() || linkResource.isPending}
              onClick={() =>
                activeProject &&
                linkResource.mutate({ projectId: activeProject.id, kind: linkKind, resourceId: linkResourceId })
              }
              className="agenthub-primary-button px-3 py-2 text-sm"
            >
              Link resource
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h2 className="mb-3 text-sm font-semibold">Project scope</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scopeGroups.map((group) => (
              <div key={group.label} className="rounded-lg border border-white/10 bg-black/10 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>{group.label}</span>
                  <span>{group.items.length}</span>
                </div>
                <div className="space-y-1">
                  {group.items.slice(0, 6).map((item) => (
                    <div key={item.id} className="truncate text-sm">
                      {itemLabel(item)}
                    </div>
                  ))}
                  {group.items.length === 0 && <div className="text-xs text-muted-foreground">None linked</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <aside className="max-h-80 w-full shrink-0 space-y-4 overflow-y-auto border-t border-white/10 bg-white/[0.03] p-3 lg:h-auto lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            Notebook
          </h2>
          <input
            aria-label="Notebook title"
            value={notebookTitle}
            onChange={(event) => setNotebookTitle(event.target.value)}
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <textarea
            aria-label="Notebook content"
            value={notebookContent}
            onChange={(event) => setNotebookContent(event.target.value)}
            className="agenthub-field min-h-28 w-full px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={
              !activeProject || !notebookTitle.trim() || !notebookContent.trim() || createNotebookDocument.isPending
            }
            onClick={() =>
              activeProject &&
              createNotebookDocument.mutate({
                projectId: activeProject.id,
                title: notebookTitle,
                content: notebookContent,
                sourceType: "note",
              })
            }
            className="agenthub-primary-button w-full px-3 py-2 text-sm"
          >
            Add notebook doc
          </button>
        </section>

        <section className="space-y-2">
          <input
            aria-label="Search notebook"
            value={notebookQuery}
            onChange={(event) => setNotebookQuery(event.target.value)}
            placeholder="Search notebook"
            className="agenthub-field w-full px-3 py-2 text-sm"
          />
          <div className="space-y-2">
            {visibleNotebookDocs.map((doc) => (
              <article key={doc.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{doc.title}</h3>
                  <button
                    type="button"
                    onClick={() => deleteNotebookDocument.mutate({ id: doc.id })}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-destructive"
                    title="Delete notebook doc"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{doc.content}</p>
              </article>
            ))}
            {visibleNotebookDocs.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-muted-foreground">
                No notebook documents.
              </p>
            )}
          </div>
        </section>
      </aside>
    </main>
  );
}
