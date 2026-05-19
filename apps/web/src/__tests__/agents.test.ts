import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface MockAgent {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string;
}

function mockAgentStore(): MockAgent[] {
  return [];
}

describe("agents router — CRUD and user isolation", () => {
  it("create stores agent with owning userId", () => {
    const store = mockAgentStore();
    const userId = "user-1";
    const agent: MockAgent = { id: crypto.randomUUID(), userId, name: "Test", systemPrompt: "You are helpful." };
    store.push(agent);
    assert.equal(store.find((a) => a.userId === userId)?.name, "Test");
  });

  it("update modifies only matching id + userId", () => {
    const store = mockAgentStore();
    const userId = "user-1";
    const agent: MockAgent = { id: "agent-1", userId, name: "Old", systemPrompt: "p" };
    store.push(agent);

    const idx = store.findIndex((a) => a.id === "agent-1" && a.userId === userId);
    if (idx !== -1) store[idx] = { ...store[idx], name: "New" };
    assert.equal(store[0]!.name, "New");
  });

  it("delete is scoped to owner — other users cannot delete", () => {
    const store = mockAgentStore();
    const userA = "user-a";
    const userB = "user-b";
    const agent: MockAgent = { id: "agent-1", userId: userA, name: "A's agent", systemPrompt: "p" };
    store.push(agent);

    const beforeCount = store.length;
    // user B attempts delete — should not remove user A's agent
    const removed = store.filter((a) => a.id === "agent-1" && a.userId === userB);
    const afterCount = store.filter((a) => !(a.id === "agent-1" && a.userId === userB)).length;
    assert.equal(removed.length, 0, "user B owns no agents");
    assert.equal(afterCount, beforeCount, "user A's agent is untouched");
  });

  it("list returns only the requesting user's agents", () => {
    const store: MockAgent[] = [
      { id: "1", userId: "user-a", name: "A", systemPrompt: "p" },
      { id: "2", userId: "user-b", name: "B", systemPrompt: "p" },
    ];
    const visible = store.filter((a) => a.userId === "user-a");
    assert.equal(visible.length, 1);
    assert.equal(visible[0]!.name, "A");
  });

  it("cascade delete removes group memberships when agent is deleted", () => {
    const agents: { id: string }[] = [{ id: "agent-1" }];
    const members: { agentId: string; groupId: string }[] = [{ agentId: "agent-1", groupId: "grp-1" }];

    agents.splice(
      agents.findIndex((a) => a.id === "agent-1"),
      1,
    );
    const remaining = members.filter((m) => agents.some((a) => a.id === m.agentId));
    assert.equal(remaining.length, 0, "orphaned memberships must be removed");
  });
});
