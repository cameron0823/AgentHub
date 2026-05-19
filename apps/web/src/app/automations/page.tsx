"use client";

import { AutomationsManager } from "@/components/AutomationsManager";

export default function AutomationsPage() {
  return (
    <div className="agenthub-page">
      <div className="agenthub-window mx-auto min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden">
        <AutomationsManager />
      </div>
    </div>
  );
}
