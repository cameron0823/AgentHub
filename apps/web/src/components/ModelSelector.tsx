"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { DEFAULT_MODEL_ID, useChatStore, type ModelMetadata } from "@/stores/chatStore";

const FALLBACK_MODEL: ModelMetadata = {
  id: DEFAULT_MODEL_ID,
  name: "qwen2.5:7b",
  providerId: "ollama",
  providerName: "Ollama",
  providerStatus: "unhealthy",
  providerLatency: -1,
  capabilities: ["chat"],
};

function formatLatency(latency?: number) {
  if (latency === undefined || latency < 0) return "offline";
  return `${latency}ms`;
}

function capabilityLabels(model: ModelMetadata) {
  const labels = model.capabilities?.length ? model.capabilities : ["chat"];
  return labels.join(" + ");
}

function displayModelLabel(model: ModelMetadata) {
  return `${model.providerName || model.providerId || "Provider"} / ${model.name}`;
}

interface ModelSelectorProps {
  sessionId: string;
}

export function ModelSelector({ sessionId }: ModelSelectorProps) {
  const { selectedModel, setAvailableModels, setSelectedModel, updateSession } = useChatStore();
  const utils = trpc.useUtils();
  const catalog = trpc.providers.catalog.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const updateServerSession = trpc.sessions.update.useMutation({
    onSuccess: () => utils.sessions.list.invalidate(),
  });

  const healthyModels: ModelMetadata[] =
    catalog.data?.models.filter((model) => model.providerStatus === "healthy") || [];
  const options = healthyModels.length > 0 ? healthyModels : [FALLBACK_MODEL];
  const hasHealthyModels = healthyModels.length > 0;
  const selectedOption = options.find((model) => model.id === selectedModel) || options[0];

  useEffect(() => {
    if (!catalog.data) return;
    setAvailableModels(catalog.data.models);
  }, [catalog.data, setAvailableModels]);

  useEffect(() => {
    if (!selectedOption || selectedOption.id === selectedModel) return;
    setSelectedModel(selectedOption.id);
  }, [selectedOption, selectedModel, setSelectedModel]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    updateSession(sessionId, { model: modelId, updatedAt: new Date() });
    updateServerSession.mutate({ id: sessionId, model: modelId });
  };

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Model"
          value={selectedOption.id}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={catalog.isLoading || updateServerSession.isPending}
          className="bg-muted rounded px-2 py-1 border outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        >
          {options.map((model) => (
            <option key={`${model.providerId || "local"}:${model.id}`} value={model.id}>
              {displayModelLabel(model)} · {formatLatency(model.providerLatency)}
            </option>
          ))}
        </select>
        {selectedOption.capabilities?.map((capability) => (
          <span key={capability} className="rounded-full bg-muted px-2 py-0.5 capitalize">
            {capability}
          </span>
        ))}
      </div>

      {catalog.isLoading ? (
        <span>Discovering local providers...</span>
      ) : catalog.isError ? (
        <span className="text-destructive">Provider discovery failed. Using {FALLBACK_MODEL.name}.</span>
      ) : !hasHealthyModels ? (
        <span className="text-amber-600">
          Local Ollama is unavailable or has no chat models. Start Ollama to enable discovered models.
        </span>
      ) : (
        <span>
          {selectedOption.providerName || "Provider"} is {selectedOption.providerStatus} ({formatLatency(selectedOption.providerLatency)}) · {capabilityLabels(selectedOption)}
        </span>
      )}
    </div>
  );
}
