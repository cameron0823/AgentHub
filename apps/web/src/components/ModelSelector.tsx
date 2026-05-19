"use client";

import { useEffect } from "react";
import { ModelSelectorView } from "@agenthub/ui";
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
    catalog.data?.models.filter(
      (model) => model.providerStatus === "healthy" && (model.capabilities?.includes("chat") ?? true),
    ) || [];
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
    <ModelSelectorView
      options={options}
      selectedModelId={selectedOption.id}
      isLoading={catalog.isLoading}
      isPending={updateServerSession.isPending}
      isError={catalog.isError}
      hasHealthyModels={hasHealthyModels}
      fallbackModelName={FALLBACK_MODEL.name}
      onChange={handleModelChange}
    />
  );
}
