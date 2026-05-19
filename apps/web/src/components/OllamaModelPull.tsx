"use client";

import { useMemo, useRef, useState } from "react";
import { Cpu, Download, Square, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

type PullState = "idle" | "pulling" | "done" | "error" | "cancelled";

type PullEvent = {
  type?: "progress" | "done" | "error";
  status?: string;
  digest?: string | null;
  completed?: number;
  total?: number;
  percent?: number | null;
  error?: string;
};

export function estimateLocalModelHardware(modelName: string) {
  const lower = modelName.toLowerCase();
  const paramsMatch = lower.match(/(\d+(?:\.\d+)?)\s*b/);
  const paramsB = paramsMatch ? Number(paramsMatch[1]) : null;
  const quantMatch = lower.match(/(?:^|[-_:])q([2-8])(?:_|\b|-)|int([48])|f16|fp16/);
  const quant = quantMatch?.[0] ?? "";
  const bytesPerParam = quant.includes("q2")
    ? 0.25
    : quant.includes("q3")
      ? 0.375
      : quant.includes("q4")
        ? 0.5
        : quant.includes("q5")
          ? 0.625
          : quant.includes("q6")
            ? 0.75
            : quant.includes("q8") || quant.includes("int8")
              ? 1
              : quant.includes("f16") || quant.includes("fp16")
                ? 2
                : 0.5;

  if (!paramsB) {
    return {
      paramsB: null,
      quantization: quant || "unknown",
      vramGb: null,
      label: "VRAM estimate unavailable",
    };
  }

  const vramGb = paramsB * bytesPerParam;
  return {
    paramsB,
    quantization: quant || "q4 assumed",
    vramGb,
    label: `~${vramGb.toFixed(vramGb >= 10 ? 0 : 1)} GB VRAM`,
  };
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function OllamaModelPull() {
  const utils = trpc.useUtils();
  const [model, setModel] = useState("qwen2.5:7b");
  const [state, setState] = useState<PullState>("idle");
  const [status, setStatus] = useState("Ready");
  const [percent, setPercent] = useState(0);
  const [speed, setSpeed] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const lastProgressRef = useRef({ completed: 0, at: 0 });
  const estimate = useMemo(() => estimateLocalModelHardware(model), [model]);

  const cancelPull = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("cancelled");
    setStatus("Cancelled");
  };

  const pullModel = async () => {
    const nextModel = model.trim();
    if (!nextModel || state === "pulling") return;
    const controller = new AbortController();
    abortRef.current = controller;
    lastProgressRef.current = { completed: 0, at: Date.now() };
    setState("pulling");
    setStatus("Starting pull");
    setPercent(0);
    setSpeed("");
    setError("");

    try {
      const res = await fetch("/api/providers/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: nextModel }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = `Pull failed with status ${res.status}`;
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the status-based error.
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          const chunk = JSON.parse(raw) as PullEvent;
          if (chunk.type === "error") throw new Error(chunk.error ?? "Pull failed");
          if (chunk.status) setStatus(chunk.status);
          if (typeof chunk.percent === "number") setPercent(chunk.percent);
          if (typeof chunk.completed === "number" && typeof chunk.total === "number" && chunk.total > 0) {
            const now = Date.now();
            const previous = lastProgressRef.current;
            const seconds = Math.max(0.001, (now - previous.at) / 1000);
            const delta = Math.max(0, chunk.completed - previous.completed);
            setSpeed(`${formatBytes(delta / seconds)}/s`);
            lastProgressRef.current = { completed: chunk.completed, at: now };
          }
          if (chunk.type === "done") {
            setPercent(100);
            setState("done");
            setStatus("Complete");
            utils.providers.catalog.invalidate();
            utils.providers.models.invalidate();
          }
        }
      }

      if (!controller.signal.aborted) {
        setState("done");
        setPercent(100);
        setStatus("Complete");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setState("cancelled");
        setStatus("Cancelled");
      } else {
        setState("error");
        setError(err instanceof Error ? err.message : "Pull failed");
      }
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="agenthub-glass-panel space-y-4 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Ollama Models</h2>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-muted-foreground">Local</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="llama3.1:8b-instruct-q4_K_M"
          className="agenthub-field min-w-0 flex-1 px-3 py-2"
          disabled={state === "pulling"}
        />
        {state === "pulling" ? (
          <button type="button" onClick={cancelPull} className="agenthub-secondary-button px-3 py-2">
            <Square className="h-4 w-4" />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pullModel()}
            className="agenthub-primary-button rounded-xl px-3 py-2"
          >
            <Download className="h-4 w-4" />
            Pull
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4" />
            <span>Hardware</span>
          </div>
          <div className="font-medium">{estimate.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {estimate.paramsB
              ? `${estimate.paramsB}B params, ${estimate.quantization}`
              : "Add a model size like 7b or 70b for an estimate."}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4" />
            <span>Status</span>
          </div>
          <div className="font-medium">{state === "error" ? error : status}</div>
          <div className="mt-1 text-xs text-muted-foreground">{speed || "Waiting for progress"}</div>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
