"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useChatStore, type AgentGroup } from "@/stores/chatStore";
import { PatternVisualizer } from "./PatternVisualizer";

const ALL_PATTERNS: AgentGroup["pattern"][] = [
  "sequential",
  "parallel",
  "supervisor",
  "iterative",
  "debate",
  "groupchat",
];

const PATTERN_DESCRIPTIONS: Record<AgentGroup["pattern"], string> = {
  sequential: "Agents run one after another. Each sees the previous agent's output.",
  parallel: "All agents run simultaneously. Outputs are synthesized at the end.",
  supervisor: "A coordinator agent plans tasks and delegates to workers, then synthesizes results.",
  iterative: "Author, Editor, Reviser loop drafts, reviews, revises, and pauses at checkpoints.",
  debate: "Agents argue in rounds with a moderator synthesis at the end.",
  groupchat: "Agents take turns in a conversation until consensus is reached.",
};

const PATTERN_ROLE_HINTS: Record<AgentGroup["pattern"], string> = {
  sequential: "Role: e.g. Step 1, Step 2",
  parallel: "Role: e.g. Researcher, Analyst",
  supervisor: "Role: supervisor or worker",
  iterative: "Role: Author, Editor, Reviser",
  debate: "Role: debater or moderator",
  groupchat: "Role: participant",
};

function emptyForm() {
  return {
    name: "",
    description: "",
    pattern: "sequential" as AgentGroup["pattern"],
    members: [] as AgentGroup["members"],
  };
}

function formFromGroup(group?: AgentGroup) {
  if (!group) return emptyForm();
  return {
    name: group.name,
    description: group.description || "",
    pattern: group.pattern,
    members: group.members.map((member, index) => ({ ...member, sortOrder: member.sortOrder ?? index })),
  };
}

export function AgentGroupBuilder() {
  const { agents, agentGroups, activeGroupId, addAgentGroup, updateAgentGroup, deleteAgentGroup, setMainView } =
    useChatStore();
  const activeGroup = useMemo(
    () => agentGroups.find((group) => group.id === activeGroupId),
    [agentGroups, activeGroupId],
  );
  const [form, setForm] = useState(() => formFromGroup(activeGroup));
  const utils = trpc.useUtils();

  useEffect(() => {
    setForm(formFromGroup(activeGroup));
  }, [activeGroup]);

  const createGroup = trpc.agentGroups.create.useMutation({
    onSuccess: (group) => {
      addAgentGroup(toAgentGroup(group));
      utils.agentGroups.list.invalidate();
      setMainView("chat");
    },
  });
  const updateServerGroup = trpc.agentGroups.update.useMutation({
    onSuccess: (_result, variables) => {
      updateAgentGroup(variables.id, {
        name: variables.name,
        description: variables.description || null,
        pattern: variables.pattern,
        members: variables.members?.map((member, index) => ({
          agentId: member.agentId,
          role: member.role || null,
          sortOrder: member.sortOrder ?? index,
        })),
      });
      utils.agentGroups.list.invalidate();
      setMainView("chat");
    },
  });
  const deleteServerGroup = trpc.agentGroups.delete.useMutation({
    onSuccess: (_result, variables) => {
      deleteAgentGroup(variables.id);
      utils.agentGroups.list.invalidate();
      setMainView("chat");
    },
  });

  const selectedIds = new Set(form.members.map((member) => member.agentId));
  const isSaving = createGroup.isPending || updateServerGroup.isPending;
  const canSave = form.name.trim() && form.members.length > 0 && !isSaving;

  const setMember = (agentId: string, enabled: boolean) => {
    setForm((current) => {
      if (!enabled) {
        return { ...current, members: current.members.filter((member) => member.agentId !== agentId) };
      }
      if (current.members.some((member) => member.agentId === agentId)) return current;
      return {
        ...current,
        members: [...current.members, { agentId, role: "", sortOrder: current.members.length }],
      };
    });
  };

  const setMemberRole = (agentId: string, role: string) => {
    setForm((current) => ({
      ...current,
      members: current.members.map((member) => (member.agentId === agentId ? { ...member, role } : member)),
    }));
  };

  const handleSave = () => {
    const members = form.members.map((member, index) => ({
      agentId: member.agentId,
      role: member.role || undefined,
      sortOrder: index,
    }));
    const input = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      pattern: form.pattern,
      members,
    };

    if (activeGroup) {
      updateServerGroup.mutate({ id: activeGroup.id, ...input });
      return;
    }

    createGroup.mutate(input);
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight">{activeGroup ? "Edit Group" : "New Group"}</h2>
            <p className="text-sm text-muted-foreground">
              Combine agents into multi-agent patterns: sequential, parallel, supervisor, iterative, debate, or group
              chat.
            </p>
          </div>
          <div className="flex gap-2">
            {activeGroup ? (
              <button
                type="button"
                onClick={() => deleteServerGroup.mutate({ id: activeGroup.id })}
                disabled={deleteServerGroup.isPending}
                className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="agenthub-primary-button flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Group
            </button>
          </div>
        </div>

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Basics</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Name</span>
              <input
                name="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Research Team"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Pattern</span>
              <select
                name="pattern"
                value={form.pattern}
                onChange={(event) => setForm({ ...form, pattern: event.target.value as AgentGroup["pattern"] })}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              >
                {ALL_PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)} — {PATTERN_DESCRIPTIONS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>Description</span>
              <input
                name="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Runs specialists and returns a combined synthesis."
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>
        </section>

        <PatternVisualizer
          pattern={form.pattern}
          members={form.members.map((m) => ({
            agentId: m.agentId,
            agentName: agents.find((a) => a.id === m.agentId)?.name ?? m.agentId,
            role: m.role,
          }))}
        />

        <section className="agenthub-glass-panel rounded-2xl p-5">
          <h3 className="mb-3 font-semibold">Members</h3>
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
              Create agents before building a group.
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => {
                const selected = selectedIds.has(agent.id);
                const member = form.members.find((item) => item.agentId === agent.id);
                return (
                  <div
                    key={agent.id}
                    className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm md:grid-cols-[1fr_220px]"
                  >
                    <label className="flex items-start gap-2">
                      <input
                        data-testid="agent-checkbox"
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => setMember(agent.id, event.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium">{agent.name}</span>
                        <span className="block text-xs text-muted-foreground">{agent.description || agent.model}</span>
                      </span>
                    </label>
                    <input
                      value={member?.role || ""}
                      onChange={(event) => setMemberRole(agent.id, event.target.value)}
                      disabled={!selected}
                      placeholder={PATTERN_ROLE_HINTS[form.pattern]}
                      className="rounded-xl border px-3 py-2 outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function toAgentGroup(group: {
  id: string;
  name: string;
  description: string | null;
  pattern: "sequential" | "parallel" | "supervisor" | "iterative" | "debate" | "groupchat";
  members: Array<{ groupId?: string; agentId: string; role?: string | null; sortOrder?: number }>;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}): AgentGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    pattern: group.pattern,
    members: group.members.map((member, index) => ({
      groupId: member.groupId || group.id,
      agentId: member.agentId,
      role: member.role ?? null,
      sortOrder: member.sortOrder ?? index,
    })),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}
