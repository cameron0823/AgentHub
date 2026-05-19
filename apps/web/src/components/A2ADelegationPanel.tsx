"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Network, Plus, Radar, Send, Trash2, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

const FRAMEWORKS = ["agenthub", "a2a", "langgraph", "crewai", "autogen", "openai-assistants", "custom"] as const;

export function A2ADelegationPanel() {
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [showCommunityForm, setShowCommunityForm] = useState(false);
  const [showPeerForm, setShowPeerForm] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [peerName, setPeerName] = useState("");
  const [peerEndpoint, setPeerEndpoint] = useState("");
  const [peerFramework, setPeerFramework] = useState<(typeof FRAMEWORKS)[number]>("a2a");
  const [selectedPeerId, setSelectedPeerId] = useState("");
  const [task, setTask] = useState("Summarize your current capabilities and accepted task format.");
  const [statusMessage, setStatusMessage] = useState("");

  const utils = trpc.useUtils();
  const adapterContracts = trpc.a2a.adapterContracts.useQuery();
  const communities = trpc.a2a.communities.useQuery();
  const peers = trpc.a2a.peers.useQuery({ communityId: selectedCommunityId || undefined });

  const selectedPeer = useMemo(
    () => peers.data?.find((peer) => peer.id === selectedPeerId) ?? peers.data?.[0] ?? null,
    [peers.data, selectedPeerId],
  );

  useEffect(() => {
    if (!selectedCommunityId && communities.data?.[0]) {
      setSelectedCommunityId(communities.data[0].id);
    }
  }, [communities.data, selectedCommunityId]);

  useEffect(() => {
    if (!selectedPeerId && peers.data?.[0]) {
      setSelectedPeerId(peers.data[0].id);
    }
  }, [peers.data, selectedPeerId]);

  const refreshA2A = async () => {
    await utils.a2a.communities.invalidate();
    await utils.a2a.peers.invalidate();
  };

  const createCommunity = trpc.a2a.createCommunity.useMutation({
    onSuccess: async (community) => {
      setSelectedCommunityId(community.id);
      setCommunityName("");
      setCommunityDescription("");
      setShowCommunityForm(false);
      setStatusMessage("Community saved.");
      await refreshA2A();
    },
    onError: (error) => setStatusMessage(error.message),
  });

  const upsertPeer = trpc.a2a.upsertPeer.useMutation({
    onSuccess: async (peer) => {
      setSelectedPeerId(peer.id);
      setPeerName("");
      setPeerEndpoint("");
      setShowPeerForm(false);
      setStatusMessage("Peer saved.");
      await refreshA2A();
    },
    onError: (error) => setStatusMessage(error.message),
  });

  const discoverLocal = trpc.a2a.discoverLocal.useMutation({
    onSuccess: async (result) => {
      setStatusMessage(
        `Discovered ${result.discovered.length} local A2A peer${result.discovered.length === 1 ? "" : "s"}.`,
      );
      await refreshA2A();
    },
    onError: (error) => setStatusMessage(error.message),
  });

  const delegate = trpc.a2a.delegate.useMutation({
    onSuccess: () => setStatusMessage("Delegation request completed."),
    onError: (error) => setStatusMessage(error.message),
  });

  const removePeer = trpc.a2a.removePeer.useMutation({
    onSuccess: async () => {
      setSelectedPeerId("");
      setStatusMessage("Peer removed.");
      await refreshA2A();
    },
    onError: (error) => setStatusMessage(error.message),
  });

  function handleCreateCommunity() {
    if (!communityName.trim()) {
      setStatusMessage("Community name is required.");
      return;
    }
    createCommunity.mutate({
      name: communityName.trim(),
      description: communityDescription.trim() || undefined,
      sharedMemoryEnabled: true,
    });
  }

  function handleAddPeer() {
    if (!peerName.trim() || !peerEndpoint.trim()) {
      setStatusMessage("Peer name and endpoint are required.");
      return;
    }
    upsertPeer.mutate({
      communityId: selectedCommunityId || undefined,
      name: peerName.trim(),
      endpoint: peerEndpoint.trim(),
      framework: peerFramework,
      discoverySource: "manual",
      status: "unknown",
    });
  }

  function handleDelegate() {
    if (!selectedPeer?.id) {
      setStatusMessage("Select a peer before delegating.");
      return;
    }
    if (!task.trim()) {
      setStatusMessage("Task is required.");
      return;
    }
    delegate.mutate({
      peerId: selectedPeer.id,
      task: task.trim(),
      metadata: { source: "settings.a2a-delegation-panel" },
    });
  }

  return (
    <div className="space-y-5" data-testid="a2a-delegation-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Network className="h-5 w-5" />
            A2A Delegation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage local and remote agent peers, communities, and cross-framework task handoff.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              discoverLocal.mutate({ communityId: selectedCommunityId || undefined, includeLoopback: true })
            }
            disabled={discoverLocal.isPending}
            className="agenthub-secondary-button flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"
          >
            <Radar className="h-4 w-4" />
            {discoverLocal.isPending ? "Discovering..." : "Discover local"}
          </button>
          <button
            type="button"
            onClick={() => setShowPeerForm((value) => !value)}
            className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add peer
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            Community
          </span>
          <select
            className="agenthub-field w-full px-3 py-2 text-sm"
            value={selectedCommunityId}
            onChange={(event) => {
              setSelectedCommunityId(event.target.value);
              setSelectedPeerId("");
            }}
          >
            {communities.data?.map((community) => (
              <option key={community.id} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setShowCommunityForm((value) => !value)}
          className="agenthub-secondary-button mt-6 flex items-center justify-center gap-2 px-3 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Create community
        </button>
      </div>

      {showCommunityForm && (
        <div className="agenthub-glass-panel grid gap-3 rounded-2xl p-4 md:grid-cols-[1fr_1fr_auto]">
          <input
            className="agenthub-field px-3 py-2 text-sm"
            placeholder="Community name"
            value={communityName}
            onChange={(event) => setCommunityName(event.target.value)}
          />
          <input
            className="agenthub-field px-3 py-2 text-sm"
            placeholder="Shared memory or delegation purpose"
            value={communityDescription}
            onChange={(event) => setCommunityDescription(event.target.value)}
          />
          <button
            type="button"
            onClick={handleCreateCommunity}
            disabled={createCommunity.isPending}
            className="agenthub-primary-button rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {showPeerForm && (
        <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="agenthub-field px-3 py-2 text-sm"
              placeholder="Peer name"
              value={peerName}
              onChange={(event) => setPeerName(event.target.value)}
            />
            <input
              className="agenthub-field px-3 py-2 font-mono text-sm"
              placeholder="http://localhost:3100/api/a2a"
              value={peerEndpoint}
              onChange={(event) => setPeerEndpoint(event.target.value)}
            />
            <select
              className="agenthub-field px-3 py-2 text-sm"
              value={peerFramework}
              onChange={(event) => setPeerFramework(event.target.value as (typeof FRAMEWORKS)[number])}
              aria-label="A2A framework"
            >
              {FRAMEWORKS.map((framework) => (
                <option key={framework} value={framework}>
                  {framework}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddPeer}
            disabled={upsertPeer.isPending}
            className="agenthub-primary-button rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          >
            Save peer
          </button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          {peers.isLoading && <p className="text-sm text-muted-foreground">Loading A2A peers...</p>}
          {peers.data?.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No A2A peers registered for this community.
            </p>
          )}
          {peers.data?.map((peer) => (
            <div
              key={peer.id}
              className={`agenthub-list-row flex items-center gap-3 p-3 ${selectedPeer?.id === peer.id ? "border-primary/70" : ""}`}
            >
              <button type="button" onClick={() => setSelectedPeerId(peer.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{peer.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{peer.endpoint}</span>
              </button>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
                {peer.framework}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${peer.status === "online" ? "bg-green-500/15 text-green-200" : "bg-white/10 text-muted-foreground"}`}
              >
                {peer.status}
              </span>
              <button
                type="button"
                onClick={() => removePeer.mutate({ id: peer.id })}
                className="agenthub-icon-button text-destructive hover:text-destructive"
                title="Remove A2A peer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="agenthub-glass-panel space-y-3 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Delegate task</h3>
              <p className="text-xs text-muted-foreground">Sends an A2A JSON-RPC task to the selected peer.</p>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">
              {selectedPeer?.name ?? "No peer"}
            </span>
          </div>
          <textarea
            className="agenthub-field min-h-24 w-full px-3 py-2 text-sm"
            value={task}
            onChange={(event) => setTask(event.target.value)}
          />
          <button
            type="button"
            onClick={handleDelegate}
            disabled={delegate.isPending || !selectedPeer}
            className="agenthub-primary-button flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {delegate.isPending ? "Delegating..." : "Delegate task"}
          </button>
          {delegate.data && (
            <pre className="max-h-48 overflow-auto rounded-xl bg-black/30 p-3 text-xs">
              {JSON.stringify(delegate.data.response, null, 2)}
            </pre>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          mDNS services: {adapterContracts.data?.mdns.map((query) => query.service).join(", ") || "loading"}
        </p>
        <p className="mt-1">
          Adapter contracts:{" "}
          {adapterContracts.data ? Object.keys(adapterContracts.data.adapters).join(", ") : "loading"}
        </p>
      </div>

      {statusMessage && <p className="text-sm text-muted-foreground">{statusMessage}</p>}
    </div>
  );
}
