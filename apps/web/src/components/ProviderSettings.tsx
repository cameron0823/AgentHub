"use client";

import { useState, useEffect, useRef } from "react";
import { Key, Plus, Trash2, TestTube, Check, X, Cloud, Lock, Github, List } from "lucide-react";
import { trpc } from "@/lib/trpc";

type CopilotState = "idle" | "initiating" | "awaiting_user" | "polling" | "authorized" | "error";

function GitHubCopilotCard({ onAuthorized }: { onAuthorized: () => void }) {
  const [state, setState] = useState<CopilotState>("idle");
  const [userCode, setUserCode] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [interval, setIntervalSec] = useState(5);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state !== "awaiting_user") return;
    let remaining = 300;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(timer); setState("error"); setError("Code expired. Try again."); }
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "polling") return;
    const poll = async () => {
      try {
        const res = await fetch("/api/oauth/github-copilot/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = (await res.json()) as { status: string };
        if (data.status === "authorized") { setState("authorized"); onAuthorized(); }
        else if (data.status === "slow_down") setIntervalSec(s => s + 5);
        else if (data.status === "expired_token") { setState("error"); setError("Code expired. Try again."); }
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(poll, interval * 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, deviceCode, interval, onAuthorized]);

  const initiate = async () => {
    setState("initiating");
    setError("");
    try {
      const res = await fetch("/api/oauth/github-copilot/device", { method: "POST" });
      const data = (await res.json()) as { user_code?: string; device_code?: string; interval?: number; error?: string };
      if (data.error || !data.user_code) { setState("error"); setError(data.error || "Unknown error"); return; }
      setUserCode(data.user_code);
      setDeviceCode(data.device_code!);
      setIntervalSec(data.interval || 5);
      setState("awaiting_user");
      setTimeout(() => setState("polling"), 5000);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  if (state === "authorized") {
    return (
      <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950 flex items-center gap-3">
        <Check className="w-5 h-5 text-green-600" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">GitHub Copilot authorized</span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Github className="w-5 h-5" />
        <span className="font-medium text-sm">GitHub Copilot</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">OAuth</span>
      </div>

      {state === "idle" && (
        <button onClick={initiate} className="w-full py-2 px-4 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 flex items-center justify-center gap-2">
          <Github className="w-4 h-4" />
          Sign in with GitHub Copilot
        </button>
      )}

      {state === "initiating" && (
        <p className="text-sm text-muted-foreground text-center py-2">Connecting to GitHub...</p>
      )}

      {(state === "awaiting_user" || state === "polling") && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Enter this code at <strong>github.com/login/device</strong></p>
          <div className="font-mono text-2xl font-bold tracking-widest text-center py-2 bg-muted rounded">
            {userCode}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <a href="https://github.com/login/device" target="_blank" rel="noreferrer" className="underline">Open GitHub →</a>
            <span>Expires in {countdown}s</span>
          </div>
          {state === "polling" && <p className="text-xs text-muted-foreground text-center animate-pulse">Waiting for authorization...</p>}
        </div>
      )}

      {state === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={initiate} className="text-sm underline text-primary">Try again</button>
        </div>
      )}
    </div>
  );
}

const CLOUD_PROVIDERS = [
  { id: "openai", name: "OpenAI", authType: "api_key" as const, defaultBaseUrl: "https://api.openai.com" },
  { id: "anthropic", name: "Anthropic (Claude)", authType: "api_key" as const, defaultBaseUrl: "https://api.anthropic.com" },
  { id: "gemini", name: "Google Gemini", authType: "api_key" as const, defaultBaseUrl: "https://generativelanguage.googleapis.com" },
  { id: "moonshot", name: "Moonshot AI (Kimi)", authType: "api_key" as const, defaultBaseUrl: "https://api.moonshot.cn" },
];

const PROVIDER_API_KEY_BANNERS: Record<string, { text: string; href: string; linkText: string }> = {
  openai: {
    text: "ChatGPT Plus/Team does not include API access.",
    href: "https://platform.openai.com/api-keys",
    linkText: "Get an API key at platform.openai.com",
  },
  anthropic: {
    text: "Claude Max does not include API access.",
    href: "https://console.anthropic.com/keys",
    linkText: "Get an API key at console.anthropic.com",
  },
  gemini: {
    text: "Gemini Advanced does not include API access.",
    href: "https://aistudio.google.com/app/apikey",
    linkText: "Get a free key at aistudio.google.com",
  },
};

export function ProviderSettings() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(CLOUD_PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [fetchModelsId, setFetchModelsId] = useState<string | null>(null);
  const [modelsCache, setModelsCache] = useState<Record<string, string[]>>({});
  const [expandedModels, setExpandedModels] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const creds = trpc.providerCredentials.list.useQuery();
  const createCred = trpc.providerCredentials.create.useMutation({
    onSuccess: () => {
      utils.providerCredentials.list.invalidate();
      utils.providers.catalog.invalidate();
      setShowAdd(false);
      setApiKey("");
      setBaseUrl("");
    },
  });
  const deleteCred = trpc.providerCredentials.delete.useMutation({
    onSuccess: () => {
      utils.providerCredentials.list.invalidate();
      utils.providers.catalog.invalidate();
    },
  });
  const testCred = trpc.providerCredentials.test.useQuery(
    { id: testingId! },
    { enabled: !!testingId, retry: false }
  );

  const fetchModelsQuery = trpc.providerCredentials.fetchModels.useQuery(
    { credentialId: fetchModelsId! },
    { enabled: !!fetchModelsId, retry: false }
  );

  useEffect(() => {
    if (fetchModelsQuery.data && fetchModelsId) {
      setModelsCache((prev) => ({ ...prev, [fetchModelsId]: fetchModelsQuery.data }));
      setExpandedModels(fetchModelsId);
    }
  }, [fetchModelsQuery.data, fetchModelsId]);

  const handleAdd = () => {
    createCred.mutate({
      providerId: selectedProvider.id,
      providerName: selectedProvider.name,
      authType: selectedProvider.authType,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || selectedProvider.defaultBaseUrl,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Cloud Provider Credentials
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={selectedProvider.id}
              onChange={(e) => {
                const p = CLOUD_PROVIDERS.find((x) => x.id === e.target.value)!;
                setSelectedProvider(p);
                setBaseUrl(p.defaultBaseUrl);
              }}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {CLOUD_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1">
              <Key className="w-3 h-3" />
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${selectedProvider.name} API key`}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
            {PROVIDER_API_KEY_BANNERS[selectedProvider.id] && (
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1.5">
                {PROVIDER_API_KEY_BANNERS[selectedProvider.id].text}{" "}
                <a
                  href={PROVIDER_API_KEY_BANNERS[selectedProvider.id].href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-amber-900 dark:hover:text-amber-300"
                >
                  {PROVIDER_API_KEY_BANNERS[selectedProvider.id].linkText} →
                </a>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Base URL (optional)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={selectedProvider.defaultBaseUrl}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!apiKey.trim() || createCred.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50"
            >
              {createCred.isPending ? "Saving..." : "Save Credential"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 border rounded-md text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <GitHubCopilotCard onAuthorized={() => { creds.refetch(); }} />

      <div className="space-y-2">
        {creds.data?.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center border rounded-lg">
            No cloud providers configured. Add your API keys to use Claude, GPT-4, Gemini, or Kimi.
          </div>
        )}

        {creds.data?.map((cred) => (
          <div key={cred.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-medium">{cred.providerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {cred.authType === "api_key" ? "API Key" : "OAuth"} •
                    {cred.baseUrl ? ` ${cred.baseUrl}` : " Default endpoint"}
                    {modelsCache[cred.id] && ` • ${modelsCache[cred.id].length} models`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {testingId === cred.id && (
                  <span className="text-xs">
                    {testCred.isLoading ? "Testing..." : testCred.data?.status === "healthy" ? (
                      <span className="text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Healthy</span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1"><X className="w-3 h-3" /> Failed</span>
                    )}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (expandedModels === cred.id) { setExpandedModels(null); return; }
                    setFetchModelsId(cred.id);
                    if (modelsCache[cred.id]) setExpandedModels(cred.id);
                  }}
                  className="p-1.5 hover:bg-muted rounded-md"
                  title="List models"
                  disabled={fetchModelsId === cred.id && fetchModelsQuery.isLoading}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTestingId(cred.id)}
                  className="p-1.5 hover:bg-muted rounded-md"
                  title="Test connection"
                >
                  <TestTube className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteCred.mutate({ id: cred.id })}
                  className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {expandedModels === cred.id && modelsCache[cred.id] && (
              <div className="border-t px-4 py-3 bg-muted/20">
                {modelsCache[cred.id].length === 0 ? (
                  <p className="text-xs text-muted-foreground">No models found.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {modelsCache[cred.id].map((m) => (
                      <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-muted border font-mono">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {fetchModelsId === cred.id && fetchModelsQuery.isLoading && (
              <div className="border-t px-4 py-2 bg-muted/20">
                <p className="text-xs text-muted-foreground animate-pulse">Fetching available models...</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Your API keys are stored encrypted in the database and are only used for making requests on your behalf.</p>
        <p className="mt-1">Local providers (Ollama, vLLM, LM Studio) do not require credentials.</p>
      </div>
    </div>
  );
}
