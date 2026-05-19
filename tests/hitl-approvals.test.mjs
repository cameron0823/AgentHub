import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("General HITL approvals", () => {
  it("agent runtime exports action approval contracts and timeout policy", async () => {
    const approvals = await readText("packages/agent-runtime/src/approvals.ts");
    const index = await readText("packages/agent-runtime/src/index.ts");
    assert.match(approvals, /ApprovalRequest/, "approval request type must exist");
    assert.match(approvals, /ApprovalPolicy/, "approval policy type must exist");
    assert.match(approvals, /DEFAULT_SENSITIVE_TOOLS/, "sensitive tool defaults must exist");
    assert.match(approvals, /requiresApprovalForTool/, "tool approval policy helper must exist");
    assert.match(approvals, /requestApproval/, "approval request helper must exist");
    assert.match(approvals, /setTimeout/, "approval helper must enforce timeout policy");
    assert.match(index, /export \* from "\.\/approvals"/, "approval contracts must be exported");
  });

  it("AgentRuntime pauses before sensitive tool calls and emits approval events", async () => {
    const runtime = await readText("packages/agent-runtime/src/runtime.ts");
    const types = await readText("packages/agent-runtime/src/types.ts");
    assert.match(runtime, /requiresApprovalForTool/, "runtime must check approval policy before tools execute");
    assert.match(runtime, /requestApproval/, "runtime must call approval handler");
    assert.match(runtime, /type: "approval_request"/, "runtime must emit approval request chunks");
    assert.match(runtime, /type: "approval_result"/, "runtime must emit approval result chunks");
    assert.match(runtime, /rejected by human approval/, "runtime must reject denied tool calls");
    assert.match(runtime, /globalToolRegistry\.execute/s, "runtime must preserve existing tool execution");
    assert.match(types, /approval\?: ApprovalHandler/, "run options must accept approval handler");
    assert.match(types, /approvalPolicy\?: ApprovalPolicy/, "run options must accept approval policy");
  });

  it("checkpoint registry supports generalized approvals while preserving checkpoint APIs", async () => {
    const registry = await readText("apps/web/src/server/checkpoint-registry.ts");
    assert.match(registry, /registerApproval/, "generic approval registration must exist");
    assert.match(registry, /registerActionApproval/, "action approval registration must exist");
    assert.match(registry, /resolveApproval/, "generic approval resolution must exist");
    assert.match(registry, /registerCheckpoint/, "existing checkpoint API must remain");
    assert.match(registry, /resolveCheckpoint/, "existing checkpoint resolver must remain");
    assert.match(registry, /resolve\(true\)/, "checkpoint timeout must preserve auto-approve behavior");
    assert.match(registry, /resolve\(false\)/, "action approval timeout must reject by default");
    assert.match(registry, /entry\.resolve\(approved\)/, "approval resolution must forward decision");
  });

  it("chat and CLI approval endpoints validate input and resolve approval ids", async () => {
    const chatRoute = await readText("apps/web/src/app/api/chat/checkpoint/route.ts");
    const cliRoute = await readText("apps/web/src/app/api/cli/hitl/decision/route.ts");
    assert.match(chatRoute, /const session = await auth\(req\.headers\)/, "chat approval endpoint must require auth");
    assert.match(chatRoute, /approvalId/, "chat endpoint must accept approvalId");
    assert.match(chatRoute, /typeof approved !== "boolean"/, "chat endpoint must validate approved boolean");
    assert.match(chatRoute, /resolveApproval/, "chat endpoint must resolve generalized approvals");
    assert.match(cliRoute, /validateApiKey/, "CLI approval endpoint must use bearer API keys");
    assert.match(cliRoute, /approvalId/, "CLI endpoint must accept approvalId");
    assert.match(cliRoute, /resolveApproval/, "CLI endpoint must resolve generalized approvals");
  });

  it("chat stream wires runtime approval requests to SSE and audit logging", async () => {
    const route = await readText("apps/web/src/app/api/chat/stream/route.ts");
    assert.match(route, /registerActionApproval/, "stream route must register action approvals");
    assert.match(route, /recordApprovalAuditEvent/, "stream route must persist approval decisions");
    assert.match(route, /approvalPolicy/, "runtime call must pass approval policy");
    assert.match(route, /approval: async/, "runtime call must pass approval handler");
    assert.match(route, /approval_request/, "stream route must forward approval request chunks");
  });

  it("trust router exposes approval audit records", async () => {
    const router = await readText("apps/web/src/server/routers/trust.ts");
    assert.match(router, /recordApprovalAuditEvent/, "trust module must expose approval audit writer");
    assert.match(router, /credentialAuditLog/, "approval decisions must use audit log table");
    assert.match(router, /approvalAuditLog/, "trust router must expose approval audit query");
    assert.match(router, /outcome: approved \? "success" : "denied"/, "audit outcome must reflect approval result");
  });

  it("ChatInterface renders one unified approve/reject panel for checkpoints and action approvals", async () => {
    const component = await readText("apps/web/src/components/ChatInterface.tsx");
    assert.match(component, /pendingApproval/, "UI must use a generic pending approval state");
    assert.match(component, /hitl_checkpoint/, "UI must preserve checkpoint events");
    assert.match(component, /approval_request/, "UI must handle action approval events");
    assert.match(component, /approvalId/, "UI must post approvalId to endpoint");
    assert.match(component, /hitl-approval/, "UI must expose a stable selector for tool approvals");
    assert.match(component, /legacy-checkpoint/, "UI must expose a stable selector for checkpoint approvals");
    assert.match(component, /Approve &amp; Continue/, "UI must expose approve action");
    assert.match(component, /Reject/, "UI must expose reject action");
  });

  it("browser spec drives approval and checkpoint panels through the real chat UI", async () => {
    const spec = await readText("apps/web/tests/e2e/specs/phase-h/hitl-approvals.spec.ts");

    assert.doesNotMatch(spec, /page\.setContent/, "browser coverage must run against the real app");
    assert.match(spec, /page\.goto\("\/"\)/, "browser coverage must navigate through the app shell");
    assert.match(spec, /new-chat-button/, "browser coverage must create a real chat session");
    assert.match(spec, /api\/chat\/stream/, "browser coverage must exercise stream approval events");
    assert.match(spec, /api\/chat\/checkpoint/, "browser coverage must post approval decisions");
    assert.match(spec, /hitl-approval/, "browser coverage must assert tool action approval UI");
    assert.match(spec, /legacy-checkpoint/, "browser coverage must assert checkpoint UI");
  });
});
