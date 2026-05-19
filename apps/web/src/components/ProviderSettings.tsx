"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Key, Plus, Trash2, TestTube, Check, X, Cloud, Lock, Github, List, ShieldAlert } from "lucide-react";
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
      if (remaining <= 0) {
        clearInterval(timer);
        setState("error");
        setError("Code expired. Try again.");
      }
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
        if (data.status === "authorized") {
          setState("authorized");
          onAuthorized();
        } else if (data.status === "slow_down") setIntervalSec((s) => s + 5);
        else if (data.status === "expired_token") {
          setState("error");
          setError("Code expired. Try again.");
        }
      } catch {
        /* keep polling */
      }
    };
    pollRef.current = setInterval(poll, interval * 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state, deviceCode, interval, onAuthorized]);

  const initiate = async () => {
    setState("initiating");
    setError("");
    try {
      const res = await fetch("/api/oauth/github-copilot/device", { method: "POST" });
      const data = (await res.json()) as {
        user_code?: string;
        device_code?: string;
        interval?: number;
        error?: string;
      };
      if (data.error || !data.user_code) {
        setState("error");
        setError(data.error || "Unknown error");
        return;
      }
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
      <div className="flex items-center gap-3 rounded-2xl border border-green-400/20 bg-green-500/10 p-4">
        <Check className="w-5 h-5 text-green-600" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">GitHub Copilot authorized</span>
      </div>
    );
  }

  return (
    <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Github className="w-5 h-5" />
        <span className="font-medium text-sm">GitHub Copilot</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">OAuth</span>
      </div>

      {state === "idle" && (
        <button onClick={initiate} className="agenthub-secondary-button w-full">
          <Github className="w-4 h-4" />
          Sign in with GitHub Copilot
        </button>
      )}

      {state === "initiating" && (
        <p className="text-sm text-muted-foreground text-center py-2">Connecting to GitHub...</p>
      )}

      {(state === "awaiting_user" || state === "polling") && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Enter this code at <strong>github.com/login/device</strong>
          </p>
          <div className="rounded-xl bg-white/10 py-2 text-center font-mono text-2xl font-bold tracking-widest">
            {userCode}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <a href="https://github.com/login/device" target="_blank" rel="noreferrer" className="underline">
              Open GitHub →
            </a>
            <span>Expires in {countdown}s</span>
          </div>
          {state === "polling" && (
            <p className="text-xs text-muted-foreground text-center animate-pulse">Waiting for authorization...</p>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={initiate} className="text-sm underline text-primary">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleGeminiOAuthCard({ onAuthorized }: { onAuthorized: () => void }) {
  const [status, setStatus] = useState<"idle" | "success">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "google_success") {
      setStatus("success");
      onAuthorized();
      // Strip the query param without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      window.history.replaceState({}, "", url.toString());
    }
  }, [onAuthorized]);

  if (status === "success") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-400/20 bg-green-500/10 p-4">
        <Check className="w-5 h-5 text-green-600" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          Google Gemini connected via OAuth
        </span>
      </div>
    );
  }

  return (
    <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Cloud className="w-5 h-5" />
        <span className="font-medium text-sm">Google Gemini</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">OAuth (optional)</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Connect with your Google account instead of an API key. Requires a paid AgentHub plan.
      </p>
      <a
        href="/api/oauth/google/initiate"
        className="agenthub-secondary-button flex w-full items-center justify-center gap-2"
      >
        <Cloud className="w-4 h-4" />
        Connect Google Account
      </a>
    </div>
  );
}

function ProviderPlanGateCard({ title, label, userPlan }: { title: string; label: string; userPlan: string }) {
  return (
    <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-amber-400" />
        <span className="font-medium text-sm">{title}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Requires Pro plan or higher. You are currently on the <span className="font-medium capitalize">{userPlan}</span>{" "}
        plan.
      </p>
    </div>
  );
}

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
  const [selectedProviderId, setSelectedProviderId] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [fetchModelsId, setFetchModelsId] = useState<string | null>(null);
  const [modelsCache, setModelsCache] = useState<Record<string, string[]>>({});
  const [expandedModels, setExpandedModels] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const creds = trpc.providerCredentials.list.useQuery();
  const catalog = trpc.providers.catalog.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const quotaCurrent = trpc.quotas.current.useQuery(undefined, { staleTime: 60_000 });
  const userPlan = (quotaCurrent.data as { plan?: string } | undefined)?.plan ?? "free";
  const isPaidPlan = userPlan === "pro" || userPlan === "team" || userPlan === "enterprise";

  const providerOptions = useMemo(
    () =>
      (catalog.data?.catalog ?? []).filter(
        (provider) => provider.type === "cloud" && provider.authType === "api_key" && provider.factory !== "none",
      ),
    [catalog.data?.catalog],
  );
  const selectedProvider =
    providerOptions.find((provider) => provider.id === selectedProviderId) ?? providerOptions[0] ?? null;
  const isBaseUrlRequired = selectedProvider?.baseUrlMode === "required" && !selectedProvider.defaultBaseUrl;
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
  const testCred = trpc.providerCredentials.test.useQuery({ id: testingId! }, { enabled: !!testingId, retry: false });

  const fetchModelsQuery = trpc.providerCredentials.fetchModels.useQuery(
    { credentialId: fetchModelsId! },
    { enabled: !!fetchModelsId, retry: false },
  );

  useEffect(() => {
    if (fetchModelsQuery.data && fetchModelsId) {
      setModelsCache((prev) => ({ ...prev, [fetchModelsId]: fetchModelsQuery.data }));
      setExpandedModels(fetchModelsId);
    }
  }, [fetchModelsQuery.data, fetchModelsId]);

  useEffect(() => {
    if (providerOptions.length === 0) return;
    const nextProvider = providerOptions.find((provider) => provider.id === selectedProviderId) ?? providerOptions[0];
    if (nextProvider.id !== selectedProviderId) {
      setSelectedProviderId(nextProvider.id);
      setBaseUrl(nextProvider.defaultBaseUrl ?? "");
    }
  }, [providerOptions, selectedProviderId]);

  const handleAdd = () => {
    if (!selectedProvider) return;
    createCred.mutate({
      providerId: selectedProvider.id,
      providerName: selectedProvider.name,
      authType: "api_key",
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || selectedProvider.defaultBaseUrl || undefined,
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
          className="agenthub-primary-button flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      {showAdd && (
        <div className="agenthub-glass-panel space-y-4 rounded-2xl p-4">
          {catalog.isLoading && providerOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading provider catalog...</p>
          ) : catalog.isError || providerOptions.length === 0 ? (
            <p className="text-sm text-destructive">Provider catalog is unavailable.</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Provider</label>
                <select
                  value={selectedProvider?.id ?? ""}
                  onChange={(e) => {
                    const provider = providerOptions.find((item) => item.id === e.target.value) ?? providerOptions[0];
                    setSelectedProviderId(provider.id);
                    setBaseUrl(provider.defaultBaseUrl ?? "");
                  }}
                  className="agenthub-field w-full px-3 py-2"
                >
                  {providerOptions.map((provider) => {
                    const accessible = (provider as { planAccessible?: boolean }).planAccessible ?? isPaidPlan;
                    return (
                      <option key={provider.id} value={provider.id}>
                        {accessible ? provider.name : `Pro required - ${provider.name}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedProvider &&
                !(selectedProvider as { planAccessible?: boolean }).planAccessible &&
                !isPaidPlan && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-300">Requires Pro plan</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cloud providers are available on Pro, Team, and Enterprise plans. You are currently on the{" "}
                        <span className="font-medium capitalize">{userPlan}</span> plan.
                      </p>
                    </div>
                  </div>
                )}

              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${selectedProvider?.name ?? "provider"} API key`}
                  className="agenthub-field w-full px-3 py-2"
                />
                {selectedProvider && PROVIDER_API_KEY_BANNERS[selectedProvider.id] && (
                  <p className="mt-1.5 rounded-xl border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
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
                <label className="block text-sm font-medium mb-1">
                  Base URL {isBaseUrlRequired ? "(required)" : "(optional)"}
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={selectedProvider?.defaultBaseUrl ?? "https://provider.example.com"}
                  className="agenthub-field w-full px-3 py-2"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={
                    !selectedProvider ||
                    !apiKey.trim() ||
                    (isBaseUrlRequired && !baseUrl.trim()) ||
                    createCred.isPending ||
                    (!(selectedProvider as { planAccessible?: boolean }).planAccessible && !isPaidPlan)
                  }
                  className="agenthub-primary-button rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {createCred.isPending ? "Saving..." : "Save Credential"}
                </button>
                <button onClick={() => setShowAdd(false)} className="agenthub-secondary-button">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isPaidPlan ? (
        <GitHubCopilotCard
          onAuthorized={() => {
            creds.refetch();
          }}
        />
      ) : (
        <ProviderPlanGateCard title="GitHub Copilot" label="OAuth" userPlan={userPlan} />
      )}

      {isPaidPlan && (
        <GoogleGeminiOAuthCard
          onAuthorized={() => {
            creds.refetch();
            catalog.refetch();
          }}
        />
      )}
      {!isPaidPlan && <ProviderPlanGateCard title="Google Gemini" label="OAuth (optional)" userPlan={userPlan} />}

      <div className="space-y-2">
        {creds.data?.length === 0 && (
          <div className="agenthub-glass-panel rounded-2xl py-8 text-center text-sm text-muted-foreground">
            No cloud providers configured. Add your API keys to use Claude, GPT-4, Gemini, or Kimi.
          </div>
        )}

        {creds.data?.map((cred) => (
          <div key={cred.id} className="agenthub-list-row overflow-hidden">
            <div className="flex items-center justify-between p-3 hover:bg-white/5">
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
                    {testCred.isLoading ? (
                      "Testing..."
                    ) : testCred.data?.status === "healthy" ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Healthy
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <X className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (expandedModels === cred.id) {
                      setExpandedModels(null);
                      return;
                    }
                    setFetchModelsId(cred.id);
                    if (modelsCache[cred.id]) setExpandedModels(cred.id);
                  }}
                  className="agenthub-icon-button"
                  title="List models"
                  disabled={fetchModelsId === cred.id && fetchModelsQuery.isLoading}
                >
                  <List className="w-4 h-4" />
                </button>
                <button onClick={() => setTestingId(cred.id)} className="agenthub-icon-button" title="Test connection">
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
              <div className="border-t border-white/10 bg-white/5 px-4 py-3">
                {modelsCache[cred.id].length === 0 ? (
                  <p className="text-xs text-muted-foreground">No models found.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {modelsCache[cred.id].map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-mono text-xs"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {fetchModelsId === cred.id && fetchModelsQuery.isLoading && (
              <div className="border-t border-white/10 bg-white/5 px-4 py-2">
                <p className="text-xs text-muted-foreground animate-pulse">Fetching available models...</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Your API keys are stored encrypted in the database and are only used for making requests on your behalf.</p>
        <p className="mt-1">
          Local providers (Ollama, vLLM, LM Studio, Piper, faster-whisper, ComfyUI, A1111) do not require credentials.
        </p>
      </div>
    </div>
  );
}
