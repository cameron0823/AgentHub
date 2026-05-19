"use client";

import { ProviderSettings } from "@/components/ProviderSettings";
import { McpSettings } from "@/components/McpSettings";
import { PromptLibraryManager } from "@/components/PromptLibraryManager";
import { TrustSettings } from "@/components/TrustSettings";
import { ToolsManager } from "@/components/ToolsManager";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { DesktopStatus } from "@/components/DesktopStatus";
import { HeterogeneousAgentSettings } from "@/components/HeterogeneousAgentSettings";
import { OllamaModelPull } from "@/components/OllamaModelPull";
import { ThemeSettings } from "@/components/ThemeSettings";
import { UsageQuotaPanel } from "@/components/UsageQuotaPanel";
import { A2ADelegationPanel } from "@/components/A2ADelegationPanel";
import { LocalMediaSettings } from "@/components/LocalMediaSettings";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session?.user) {
    return (
      <div className="agenthub-page flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto max-w-3xl px-6 py-8 md:px-10">
        <h1 className="mb-8 text-5xl font-semibold tracking-tight">Settings</h1>

        <div className="space-y-8">
          <section>
            <ThemeSettings />
          </section>

          <hr className="border-white/15" />

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Language</h2>
              <LocaleSwitcher />
            </div>
          </section>

          <hr className="border-white/15" />

          <section>
            <DesktopStatus />
          </section>

          <hr className="border-white/15" />

          <section>
            <UsageQuotaPanel />
          </section>

          <hr className="border-white/15" />

          <section>
            <ProviderSettings />
          </section>

          <hr className="border-white/15" />

          <section>
            <OllamaModelPull />
          </section>

          <hr className="border-white/15" />

          <section>
            <LocalMediaSettings />
          </section>

          <hr className="border-white/15" />

          <section>
            <McpSettings />
          </section>

          <hr className="border-white/15" />

          <section>
            <ToolsManager />
          </section>

          <hr className="border-white/15" />

          <section>
            <HeterogeneousAgentSettings />
          </section>

          <hr className="border-white/15" />

          <section>
            <A2ADelegationPanel />
          </section>

          <hr className="border-white/15" />

          <section>
            <h2 className="text-lg font-semibold mb-4">Prompt Library</h2>
            <PromptLibraryManager />
          </section>

          <hr className="border-white/15" />

          <section>
            <TrustSettings />
          </section>
        </div>
      </div>
    </div>
  );
}
