"use client";

import type { ModelMetadata } from "./types";

interface ModelSelectorViewProps {
  options: ModelMetadata[];
  selectedModelId: string;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  hasHealthyModels?: boolean;
  fallbackModelName: string;
  onChange: (modelId: string) => void;
}

export function formatLatency(latency?: number) {
  if (latency === undefined || latency < 0) return "offline";
  return `${latency}ms`;
}

export function capabilityLabels(model: ModelMetadata) {
  const labels = model.capabilities?.length ? model.capabilities : ["chat"];
  return labels.join(" + ");
}

export function displayModelLabel(model: ModelMetadata) {
  return `${model.providerName || model.providerId || "Provider"} / ${model.name}`;
}

export function ModelSelectorView({
  options,
  selectedModelId,
  isLoading = false,
  isPending = false,
  isError = false,
  hasHealthyModels = true,
  fallbackModelName,
  onChange,
}: ModelSelectorViewProps) {
  const selectedOption = options.find((model) => model.id === selectedModelId) || options[0];

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-300">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Model"
          value={selectedOption?.id || ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={isLoading || isPending}
          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-slate-100 outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        >
          {options.map((model) => (
            <option key={`${model.providerId || "local"}:${model.id}`} value={model.id}>
              {displayModelLabel(model)} {"\u00b7"} {formatLatency(model.providerLatency)}
            </option>
          ))}
        </select>
        {selectedOption?.capabilities?.map((capability) => (
          <span key={capability} className="rounded-full bg-white/10 px-2 py-0.5 capitalize">
            {capability}
          </span>
        ))}
      </div>

      {isLoading ? (
        <span>Discovering local providers...</span>
      ) : isError ? (
        <span className="text-destructive">Provider discovery failed. Using {fallbackModelName}.</span>
      ) : !hasHealthyModels ? (
        <span className="text-amber-600">
          Local Ollama is unavailable or has no chat models. Start Ollama to enable discovered models.
        </span>
      ) : selectedOption ? (
        <span>
          {selectedOption.providerName || "Provider"} is {selectedOption.providerStatus} (
          {formatLatency(selectedOption.providerLatency)}) {"\u00b7"} {capabilityLabels(selectedOption)}
        </span>
      ) : null}
    </div>
  );
}
