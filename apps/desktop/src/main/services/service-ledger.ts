export type ServiceId =
  | "web"
  | "database"
  | "redis"
  | "objectStorage"
  | "auth"
  | "search"
  | "ollama"
  | "lmstudio"
  | "vllm";

export type ServiceStatus = "unknown" | "checking" | "healthy" | "unhealthy" | "not-configured";
export type ServiceAction = "start-docker" | "open-settings" | "open-docs" | "retry";

export type ServiceState = {
  id: ServiceId;
  label: string;
  requiredFor: "launch" | "chat" | "files" | "automations" | "optional";
  configuredUrl?: string;
  status: ServiceStatus;
  action?: ServiceAction;
};

export const defaultServiceLedger: ServiceState[] = [
  { id: "web", label: "AgentHub web", requiredFor: "launch", status: "unknown", action: "retry" },
  { id: "database", label: "PostgreSQL", requiredFor: "launch", status: "unknown", action: "start-docker" },
  { id: "redis", label: "Redis", requiredFor: "automations", status: "unknown", action: "start-docker" },
  { id: "objectStorage", label: "Object storage", requiredFor: "files", status: "unknown", action: "start-docker" },
  { id: "auth", label: "Casdoor", requiredFor: "optional", status: "unknown", action: "open-docs" },
  { id: "search", label: "SearXNG", requiredFor: "optional", status: "unknown", action: "open-docs" },
  { id: "ollama", label: "Ollama", requiredFor: "chat", status: "not-configured", action: "open-settings" },
  { id: "lmstudio", label: "LM Studio", requiredFor: "chat", status: "not-configured", action: "open-settings" },
  { id: "vllm", label: "vLLM", requiredFor: "chat", status: "not-configured", action: "open-settings" },
];

export function updateServiceState(services: ServiceState[], patch: Pick<ServiceState, "id"> & Partial<ServiceState>) {
  return services.map((service) => (service.id === patch.id ? { ...service, ...patch } : service));
}
