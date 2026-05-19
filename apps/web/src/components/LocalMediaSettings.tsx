"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ImageIcon, Mic, RefreshCw, Volume2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const MEDIA_PROVIDER_IDS = ["piper", "faster-whisper", "comfyui", "a1111"] as const;
const MEDIA_PROVIDER_CATALOG = [
  { id: "piper", name: "Piper TTS", defaultBaseUrl: "http://localhost:10200" },
  { id: "faster-whisper", name: "faster-whisper STT", defaultBaseUrl: "http://localhost:10300" },
  { id: "comfyui", name: "ComfyUI", defaultBaseUrl: "http://localhost:8188" },
  { id: "a1111", name: "AUTOMATIC1111", defaultBaseUrl: "http://localhost:7860" },
] as const;

type QueueCounts = Record<string, number>;
type ImageQueueStatus = {
  queue: "image-generation";
  counts: QueueCounts | null;
  degraded?: boolean;
  error?: string;
  updatedAt: string;
};

type QueueProgressEvent = {
  queue: string;
  jobId: string;
  progress: number | object;
  message?: string;
};

function providerIcon(providerId: string) {
  if (providerId === "piper") return <Volume2 className="h-4 w-4" />;
  if (providerId === "faster-whisper") return <Mic className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

function countSummary(counts: QueueCounts | null) {
  if (!counts) return "offline";
  const active = counts.active ?? 0;
  const waiting = counts.waiting ?? 0;
  const failed = counts.failed ?? 0;
  return `${active} active / ${waiting} waiting / ${failed} failed`;
}

export function LocalMediaSettings() {
  const catalog = trpc.providers.catalog.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const [queueStatus, setQueueStatus] = useState<ImageQueueStatus | null>(null);
  const [queueEvents, setQueueEvents] = useState<QueueProgressEvent[]>([]);

  const mediaProviders = useMemo(() => {
    const healthByProvider = new Map((catalog.data?.providers ?? []).map((provider) => [provider.id, provider]));
    return MEDIA_PROVIDER_CATALOG.map((provider) => ({
      ...provider,
      status: healthByProvider.get(provider.id)?.status ?? "unhealthy",
      metadata: {
        ...provider,
        defaultBaseUrl: healthByProvider.get(provider.id)?.metadata?.defaultBaseUrl ?? provider.defaultBaseUrl,
      },
    }));
  }, [catalog.data?.providers]);

  const refreshQueue = useCallback(async () => {
    const res = await fetch("/api/queues/image-generation/status");
    if (!res.ok) return;
    setQueueStatus((await res.json()) as ImageQueueStatus);
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/queues/progress");
    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as QueueProgressEvent;
        if (payload.queue !== "image-generation") return;
        setQueueEvents((current) => [payload, ...current.filter((item) => item.jobId !== payload.jobId).slice(0, 4)]);
        void refreshQueue();
      } catch {
        // Ignore malformed progress events from older queue publishers.
      }
    };
    return () => events.close();
  }, [refreshQueue]);

  return (
    <div className="space-y-5" data-testid="local-media-settings">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5" />
            Local Media Services
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Piper, faster-whisper, ComfyUI, and A1111 use the provider registry and local service endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void catalog.refetch();
            void refreshQueue();
          }}
          className="agenthub-secondary-button flex items-center gap-2 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {mediaProviders.map((provider) => (
          <div key={provider.id} className="agenthub-list-row flex items-center gap-3 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-muted-foreground">
              {providerIcon(provider.id)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{provider.name}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {provider.metadata?.defaultBaseUrl ?? "local service"}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${provider.status === "healthy" ? "bg-green-500/15 text-green-200" : "bg-white/10 text-muted-foreground"}`}
            >
              {provider.status}
            </span>
          </div>
        ))}
      </div>

      <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Generated-image queue</h3>
            <p className="text-xs text-muted-foreground">{countSummary(queueStatus?.counts ?? null)}</p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
            {queueStatus?.updatedAt ? new Date(queueStatus.updatedAt).toLocaleTimeString() : "pending"}
          </span>
        </div>
        {queueStatus?.degraded && <p className="text-xs text-amber-200">{queueStatus.error}</p>}
        {queueEvents.length > 0 && (
          <div className="space-y-2">
            {queueEvents.map((event) => (
              <div
                key={event.jobId}
                className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 text-xs"
              >
                <span className="truncate font-mono">{event.jobId}</span>
                <span className="text-muted-foreground">{event.message ?? JSON.stringify(event.progress)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
