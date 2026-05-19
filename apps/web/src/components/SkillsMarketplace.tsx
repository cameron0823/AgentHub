"use client";

import { useMemo, useState } from "react";
import { BookOpen, PackageCheck, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Skill action failed.";
}

export function SkillsMarketplace() {
  const [message, setMessage] = useState<string | null>(null);
  const [referenceOutput, setReferenceOutput] = useState("");
  const utils = trpc.useUtils();
  const catalog = trpc.skills.catalog.useQuery();
  const installed = trpc.skills.list.useQuery();
  const installSkill = trpc.skills.installCatalogItem.useMutation({
    onSuccess: (result) => {
      setMessage(
        `Installed ${result.summary.name}. Enable ${result.summary.enabledToolId} on an agent to activate it in chat.`,
      );
      utils.skills.list.invalidate();
    },
  });
  const updateSkill = trpc.skills.updateFromCatalog.useMutation({
    onSuccess: (result) => {
      setMessage(`Updated ${result.summary.name}.`);
      utils.skills.list.invalidate();
    },
  });
  const removeSkill = trpc.skills.remove.useMutation({
    onSuccess: () => {
      setMessage("Removed installed skill.");
      utils.skills.list.invalidate();
    },
  });
  const runSkill = trpc.skills.runSkill.useMutation({
    onSuccess: (result) => {
      setReferenceOutput(JSON.stringify(result, null, 2));
    },
  });
  const readReference = trpc.skills.readReference.useMutation({
    onSuccess: (result) => {
      setReferenceOutput(JSON.stringify(result, null, 2));
    },
  });

  const installedSlugs = useMemo(() => new Set((installed.data || []).map((skill) => skill.slug)), [installed.data]);
  const catalogItems = catalog.data || [];
  const installedItems = installed.data || [];
  const actionError =
    installSkill.error || updateSkill.error || removeSkill.error || runSkill.error || readReference.error;

  const firstReferenceFor = (slug: string) => {
    const item = catalogItems.find((candidate) => candidate.summary.slug === slug);
    return (
      item?.package.resources.find((resource) => resource.type === "reference")?.path || "references/brief-format.md"
    );
  };

  return (
    <section className="agenthub-glass-panel rounded-2xl p-5" data-testid="skills-marketplace">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-primary/15 p-3 text-primary">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Skills Marketplace</h3>
          <p className="text-sm text-muted-foreground">
            Install governed skill packages, inspect permissions, and enable skill tools on agents.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-primary" />
            Browse Skills
          </div>
          {catalog.isLoading ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
              Loading skills...
            </div>
          ) : (
            <div className="grid gap-3">
              {catalogItems.map((item) => (
                <article key={item.summary.slug} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{item.summary.name}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{item.summary.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.summary.version} / {item.summary.license || "No license"} / {item.summary.resourceCount}{" "}
                        resource(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => installSkill.mutate({ slug: item.summary.slug })}
                      disabled={installSkill.isPending}
                      className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
                    >
                      Install Skill
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.summary.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/10 p-3 text-xs text-muted-foreground">
                    <div className="font-semibold text-slate-200">Permissions</div>
                    <div>{item.summary.permissionOperations.join(", ")}</div>
                    <div>
                      Network: {item.summary.allowNetwork ? "allowed" : "blocked"} / Filesystem:{" "}
                      {item.summary.allowFileSystem ? "allowed" : "blocked"}
                    </div>
                    <div>Script execution: {item.summary.scriptExecution}</div>
                  </div>
                  {installedSlugs.has(item.summary.slug) ? (
                    <p className="mt-2 text-xs text-emerald-300">Installed as {item.summary.enabledToolId}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Installed Skills
          </div>
          {installed.isLoading ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
              Loading installed skills...
            </div>
          ) : installedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-muted-foreground">
              No skills installed yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {installedItems.map((skill) => (
                <article key={skill.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{skill.name}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Enable tool ID: {skill.enabledToolId}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateSkill.mutate({ slug: skill.slug })}
                        disabled={updateSkill.isPending}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSkill.mutate({ slug: skill.slug })}
                        disabled={removeSkill.isPending}
                        className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/15 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        runSkill.mutate({ slug: skill.slug, task: "Preview skill activation from marketplace." })
                      }
                      disabled={runSkill.isPending}
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                    >
                      Preview run_skill
                    </button>
                    <button
                      type="button"
                      onClick={() => readReference.mutate({ slug: skill.slug, path: firstReferenceFor(skill.slug) })}
                      disabled={readReference.isPending}
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
                    >
                      Read bundled reference
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {message ? (
        <div role="status" className="mt-4 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="mt-4 text-sm text-destructive">
          {getErrorMessage(actionError)}
        </div>
      ) : null}
      {referenceOutput ? (
        <pre className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
          {referenceOutput}
        </pre>
      ) : null}
    </section>
  );
}
