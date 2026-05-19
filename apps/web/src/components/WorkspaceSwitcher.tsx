"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function WorkspaceSwitcher() {
  const utils = trpc.useUtils();
  const workspacesQuery = trpc.workspaces.list.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const workspaces = useMemo(() => workspacesQuery.data ?? [], [workspacesQuery.data]);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!activeWorkspaceId && workspaces[0]) setActiveWorkspaceId(workspaces[0].id);
  }, [activeWorkspaceId, workspaces]);

  const createWorkspace = trpc.workspaces.create.useMutation({
    onSuccess: (workspace) => {
      setActiveWorkspaceId(workspace.id);
      setNewWorkspaceName("");
      void utils.workspaces.list.invalidate();
    },
  });

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (workspacesQuery.isError) return null;

  return (
    <div ref={rootRef} className="relative min-w-0" data-testid="workspace-switcher">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 max-w-[11rem] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 hover:bg-white/10 sm:max-w-56"
        title="Switch workspace"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: activeWorkspace?.brandColor ?? "#1890ff" }}
        />
        <span className="truncate">{activeWorkspace?.name ?? "Personal workspace"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-[calc(100vw-1rem)] max-w-80 rounded-lg border border-white/10 bg-slate-950 p-2 shadow-2xl"
          data-testid="workspace-menu"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your workspaces
          </div>
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => {
                  setActiveWorkspaceId(workspace.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-white/10 ${
                  workspace.id === activeWorkspace?.id ? "bg-primary/15 text-primary" : "text-slate-100"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: workspace.brandColor ?? "#1890ff" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{workspace.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{workspace.role}</span>
                </span>
                {workspace.id === activeWorkspace?.id && <Check className="h-4 w-4" />}
              </button>
            ))}
            {workspaces.length === 0 && (
              <div className="rounded-md px-2 py-3 text-xs text-muted-foreground">
                Create a workspace to share agents, projects, files, and settings.
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="flex gap-2">
              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                className="agenthub-field min-w-0 flex-1 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={!newWorkspaceName.trim() || createWorkspace.isPending}
                onClick={() => createWorkspace.mutate({ name: newWorkspaceName })}
                className="agenthub-primary-button inline-flex items-center gap-1 px-2 py-1.5 text-xs disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Create
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Invite and role controls live in workspace settings.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
