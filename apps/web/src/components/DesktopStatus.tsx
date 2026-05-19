"use client";

import { useCallback, useEffect, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { getDesktopRuntime, hasDesktopRuntime, type BrowserDesktopRuntimeInfo } from "@/lib/desktop-runtime";

function statusTone(status: string) {
  if (status === "healthy") return "text-green-300";
  if (status === "unhealthy") return "text-red-300";
  if (status === "not-configured") return "text-yellow-300";
  return "text-muted-foreground";
}

export function DesktopStatus() {
  const [runtime, setRuntime] = useState<BrowserDesktopRuntimeInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const desktop = getDesktopRuntime();
    if (!desktop) return;
    setLoading(true);
    try {
      setRuntime(await desktop.getRuntimeInfo());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasDesktopRuntime()) return;
    void refresh();
  }, [refresh]);

  if (!hasDesktopRuntime()) {
    return null;
  }

  const services = runtime?.services;

  return (
    <div className="agenthub-glass-panel rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Monitor className="h-5 w-5" />
          Desktop
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="agenthub-icon-button"
          title="Refresh desktop status"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {runtime ? (
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Version</span>
            <p className="font-medium">{runtime.appVersion}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Platform</span>
            <p className="font-medium">{runtime.platform}</p>
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground">Origin</span>
            <p className="break-all font-mono text-xs">{runtime.webOrigin}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Web</span>
            <p className={statusTone(services?.web ?? "unknown")}>{services?.web ?? "unknown"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Database</span>
            <p className={statusTone(services?.database ?? "unknown")}>{services?.database ?? "unknown"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Redis</span>
            <p className={statusTone(services?.redis ?? "unknown")}>{services?.redis ?? "unknown"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Object storage</span>
            <p className={statusTone(services?.objectStorage ?? "unknown")}>{services?.objectStorage ?? "unknown"}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading desktop status...</p>
      )}
    </div>
  );
}
