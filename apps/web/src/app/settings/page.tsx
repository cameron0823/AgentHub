"use client";

import { ProviderSettings } from "@/components/ProviderSettings";
import { McpSettings } from "@/components/McpSettings";
import { PromptLibraryManager } from "@/components/PromptLibraryManager";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session?.user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-8">
        <section>
          <ProviderSettings />
        </section>

        <hr className="border-border" />

        <section>
          <McpSettings />
        </section>

        <hr className="border-border" />

        <section>
          <h2 className="text-lg font-semibold mb-4">Prompt Library</h2>
          <PromptLibraryManager />
        </section>
      </div>
    </div>
  );
}
