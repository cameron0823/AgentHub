"use client";

import { useMemo, useState } from "react";
import { Bot, Play, Plus, ShieldAlert, Terminal, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DEFAULT_ARGS = '["--help"]';
const DEFAULT_ENV = "{}";

function parseJsonArray(value: string): string[] {
  if (!value.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Args JSON array must contain only strings.");
  }
  return parsed;
}

function parseJsonRecord(value: string): Record<string, string> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Environment JSON must be an object.");
  }
  const entries = Object.entries(parsed);
  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    throw new Error("Environment JSON values must be strings.");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function formatArgs(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").join(" ");
}

export function HeterogeneousAgentSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"claude" | "codex" | "generic">("generic");
  const [command, setCommand] = useState("");
  const [argsJson, setArgsJson] = useState(DEFAULT_ARGS);
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [envJson, setEnvJson] = useState(DEFAULT_ENV);
  const [testPrompt, setTestPrompt] = useState("Return runtime version and exit.");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [formError, setFormError] = useState("");
  const [lastRun, setLastRun] = useState<{ status: string; output?: string; error?: string } | null>(null);

  const utils = trpc.useUtils();
  const profiles = trpc.heterogeneous.list.useQuery();
  const selectedProfile = useMemo(
    () => profiles.data?.find((profile) => profile.id === selectedProfileId) ?? profiles.data?.[0] ?? null,
    [profiles.data, selectedProfileId],
  );

  const createProfile = trpc.heterogeneous.create.useMutation({
    onSuccess: async (profile) => {
      await utils.heterogeneous.list.invalidate();
      setSelectedProfileId(profile.id);
      setShowAdd(false);
      resetForm();
    },
    onError: (error) => setFormError(error.message),
  });
  const deleteProfile = trpc.heterogeneous.delete.useMutation({
    onSuccess: async () => {
      await utils.heterogeneous.list.invalidate();
      setSelectedProfileId("");
    },
    onError: (error) => setFormError(error.message),
  });
  const startRun = trpc.heterogeneous.startRun.useMutation({
    onSuccess: (run) => setLastRun({ status: run.status, output: run.output, error: run.error }),
    onError: (error) => setLastRun({ status: "error", error: error.message }),
  });

  function resetForm() {
    setName("");
    setDescription("");
    setKind("generic");
    setCommand("");
    setArgsJson(DEFAULT_ARGS);
    setWorkingDirectory("");
    setEnvJson(DEFAULT_ENV);
    setFormError("");
  }

  function handleCreate() {
    setFormError("");
    try {
      if (!name.trim()) throw new Error("Name is required.");
      if (!command.trim()) throw new Error("Command is required.");
      createProfile.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        kind,
        command: command.trim(),
        args: parseJsonArray(argsJson),
        workingDirectory: workingDirectory.trim() || undefined,
        env: parseJsonRecord(envJson),
        isEnabled: true,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Invalid heterogeneous agent profile.");
    }
  }

  function handleStartRun() {
    const profileId = selectedProfile?.id;
    if (!profileId) {
      setLastRun({ status: "error", error: "Create or select a profile before starting a test run." });
      return;
    }
    setLastRun(null);
    startRun.mutate({
      profileId,
      prompt: testPrompt.trim() || "Health check",
    });
  }

  return (
    <div className="space-y-5" data-testid="heterogeneous-agent-settings">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="h-5 w-5" />
            Heterogeneous Agent Runtime
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Register local CLI agent profiles after the desktop shell and service startup are stable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((value) => !value)}
          className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add profile
        </button>
      </div>

      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Disabled until AGENTHUB_HETEROGENEOUS_ENABLED is true.</p>
            <p>
              Native process execution requires a Command allowlist, scoped environment keys, and a workspace root.
              Profiles use argument arrays only; shell strings are rejected by the runner.
            </p>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="agenthub-glass-panel space-y-4 rounded-2xl p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Name</span>
              <input
                className="agenthub-field w-full px-3 py-2 text-sm"
                placeholder="Local Codex"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Kind</span>
              <select
                className="agenthub-field w-full px-3 py-2 text-sm"
                value={kind}
                onChange={(event) => setKind(event.target.value as "claude" | "codex" | "generic")}
              >
                <option value="generic">generic</option>
                <option value="codex">codex</option>
                <option value="claude">claude</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Description</span>
            <input
              className="agenthub-field w-full px-3 py-2 text-sm"
              placeholder="Runs a local CLI agent through the safe runner"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Terminal className="h-4 w-4" />
              Command
            </span>
            <input
              className="agenthub-field w-full px-3 py-2 font-mono text-sm"
              placeholder="codex"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Args JSON array</span>
              <textarea
                className="agenthub-field min-h-24 w-full px-3 py-2 font-mono text-sm"
                value={argsJson}
                onChange={(event) => setArgsJson(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Environment JSON</span>
              <textarea
                className="agenthub-field min-h-24 w-full px-3 py-2 font-mono text-sm"
                value={envJson}
                onChange={(event) => setEnvJson(event.target.value)}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Working directory</span>
            <input
              className="agenthub-field w-full px-3 py-2 font-mono text-sm"
              placeholder="/home/coxar/projects/AgentHub"
              value={workingDirectory}
              onChange={(event) => setWorkingDirectory(event.target.value)}
            />
          </label>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createProfile.isPending}
              className="agenthub-primary-button rounded-xl px-3 py-2 text-sm disabled:opacity-50"
            >
              {createProfile.isPending ? "Saving..." : "Save profile"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                resetForm();
              }}
              className="agenthub-secondary-button px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {profiles.isLoading && <p className="text-sm text-muted-foreground">Loading heterogeneous profiles...</p>}
        {profiles.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No heterogeneous agent profiles configured.</p>
        )}
        {profiles.data?.map((profile) => (
          <div
            key={profile.id}
            className={`agenthub-list-row flex w-full items-center gap-3 p-3 text-left ${
              selectedProfile?.id === profile.id ? "border-primary/70" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedProfileId(profile.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{profile.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {profile.command} {formatArgs(profile.args)}
                </span>
              </span>
            </button>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">{profile.kind}</span>
            <button
              type="button"
              onClick={() => deleteProfile.mutate({ id: profile.id })}
              className="agenthub-icon-button text-destructive hover:text-destructive"
              title="Delete heterogeneous profile"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Test run</h3>
            <p className="text-xs text-muted-foreground">
              Uses the selected profile and the same gated native process runner as production runs.
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
            {selectedProfile?.name ?? "No profile"}
          </span>
        </div>
        <textarea
          className="agenthub-field min-h-20 w-full px-3 py-2 text-sm"
          value={testPrompt}
          onChange={(event) => setTestPrompt(event.target.value)}
        />
        <button
          type="button"
          onClick={handleStartRun}
          disabled={startRun.isPending || !selectedProfile}
          className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {startRun.isPending ? "Starting..." : "Start test run"}
        </button>
        {lastRun && (
          <div className="rounded-xl bg-black/30 p-3 font-mono text-xs">
            <p>Status: {lastRun.status}</p>
            {lastRun.output && <pre className="mt-2 whitespace-pre-wrap text-green-200">{lastRun.output}</pre>}
            {lastRun.error && <pre className="mt-2 whitespace-pre-wrap text-red-200">{lastRun.error}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}
