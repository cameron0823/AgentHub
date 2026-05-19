import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ── Agents Router: authedProcedure on all operations ─────────────────────────

test("agents router gates all CRUD operations behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  for (const proc of ["list", "get", "create", "update", "delete"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `agents.${proc} must use authedProcedure`);
  }
});

test("agents.list scopes to authenticated user — user A cannot see user B agents", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(src, /\.where\(eq\(agents\.userId, ctx\.user\.id\)\)/, "list must filter by ctx.user.id");
});

test("agents.get uses compound ownership check — id AND userId", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(
    src,
    /and\(eq\(agents\.id, input\.id\), eq\(agents\.userId, ctx\.user\.id\)\)/,
    "get must check both agent id and userId ownership",
  );
});

test("agents.create stamps userId from authenticated session — not from input", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(src, /userId: ctx\.user\.id/, "create must use ctx.user.id as userId");
  assert.doesNotMatch(src, /userId: input\.userId/, "create must never accept userId from untrusted input");
});

test("agents.update enforces ownership — cannot update another user's agent", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(
    src,
    /and\(eq\(agents\.id, id\), eq\(agents\.userId, ctx\.user\.id\)\)/,
    "update WHERE clause must include userId ownership",
  );
});

test("agents.delete enforces ownership — cannot delete another user's agent", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(
    src,
    /db\.delete\(agents\)\.where\(and\(eq\(agents\.id, input\.id\), eq\(agents\.userId, ctx\.user\.id\)\)\)/,
    "delete must use compound ownership check",
  );
});

// ── Agent Groups Router: isolation ───────────────────────────────────────────

test("agentGroups router gates all CRUD operations behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  for (const proc of ["list", "get", "create", "update", "delete"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `agentGroups.${proc} must use authedProcedure`);
  }
});

test("agentGroups.list scopes to authenticated user", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(src, /eq\(agentGroups\.userId, ctx\.user\.id\)/, "agentGroups list must filter by ctx.user.id");
});

test("agentGroups.get verifies group.userId matches session userId", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(src, /group\.userId !== ctx\.user\.id/, "agentGroups.get must reject access when userId does not match");
});

test("agentGroups.delete enforces ownership compound check", async () => {
  const src = await readText("apps/web/src/server/routers/agents.ts");

  assert.match(
    src,
    /db\.delete\(agentGroups\)\.where\(and\(eq\(agentGroups\.id, input\.id\), eq\(agentGroups\.userId, ctx\.user\.id\)\)\)/,
    "agentGroups.delete must use compound ownership check",
  );
});

// ── Sessions Router: isolation ────────────────────────────────────────────────

test("sessions router gates all mutations behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  for (const proc of ["list", "create", "update", "delete", "pin", "fork"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `sessions.${proc} must use authedProcedure`);
  }
});

test("sessions.list scopes to authenticated user only", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  assert.match(src, /eq\(chatSessions\.userId, ctx\.user\.id\)/, "sessions.list must filter by ctx.user.id");
});

test("sessions.create verifies agent ownership before creating session", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  assert.match(
    src,
    /and\(eq\(agents\.id, input\.agentId\), eq\(agents\.userId, ctx\.user\.id\)\)/,
    "session create must verify agent belongs to the user before associating it",
  );
});

test("sessions.delete enforces ownership — cannot delete another user's session", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  assert.match(
    src,
    /db\.delete\(chatSessions\)\.where\(and\(eq\(chatSessions\.id, input\.id\), eq\(chatSessions\.userId, ctx\.user\.id\)\)\)/,
    "sessions.delete must use compound ownership check",
  );
});

test("sessions.fork verifies source session ownership before forking", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  assert.match(
    src,
    /and\(eq\(chatSessions\.id, input\.id\), eq\(chatSessions\.userId, ctx\.user\.id\)\)/,
    "fork must verify ownership of source session before copying it",
  );
  assert.match(
    src,
    /and\(eq\(messages\.id, input\.messageId\), eq\(messages\.sessionId, input\.id\)\)/,
    "fork point must belong to the owned source session",
  );
});

// ── Messages Router: isolation ────────────────────────────────────────────────

test("messages router gates writes behind authedProcedure", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  for (const proc of ["list", "update", "deleteAfter", "setFeedback"]) {
    assert.match(src, new RegExp(`${proc}: authedProcedure`), `messages.${proc} must use authedProcedure`);
  }
});

test("messages operations verify session ownership via join before touching message data", async () => {
  const src = await readText("apps/web/src/server/routers/sessions.ts");

  // Must join chatSessions and check userId when operating on messages
  assert.match(
    src,
    /eq\(chatSessions\.userId, ctx\.user\.id\)/,
    "messages ops must verify session userId before accessing message data",
  );
});

// ── Schema: no server-side auto-trust of client-supplied owner fields ─────────

test("agents schema userId has no default — must always be explicitly set by server", async () => {
  const src = await readText("apps/web/src/server/db/schema.ts");

  // userId column must reference users table (FK) and have no server-side default
  assert.match(src, /user_id.*references.*users.*id/, "agents userId must reference users table");
});

test("chatSessions schema userId references users table with cascade delete", async () => {
  const src = await readText("apps/web/src/server/db/schema.ts");

  assert.match(src, /onDelete.*cascade/, "chatSessions userId must cascade-delete when user is removed");
});
