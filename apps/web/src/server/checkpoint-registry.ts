type ApprovalEntry = {
  resolve: (approved: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
  kind: "group_checkpoint" | "tool_action";
};

const registry = new Map<string, ApprovalEntry>();

const CHECKPOINT_TIMEOUT_MS = 300_000; // 5 minutes: preserve legacy auto-approve behavior.
const ACTION_APPROVAL_TIMEOUT_MS = 300_000; // Tool/action approvals deny by default on timeout.

export function registerApproval(
  id: string,
  options: { kind?: ApprovalEntry["kind"]; timeoutMs?: number; timeoutDefault?: boolean } = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      registry.delete(id);
      if (options.timeoutDefault === true) resolve(true);
      else resolve(false);
    }, options.timeoutMs ?? ACTION_APPROVAL_TIMEOUT_MS);
    registry.set(id, { resolve, timeout, kind: options.kind ?? "tool_action" });
  });
}

export function registerActionApproval(id: string): Promise<boolean> {
  return registerApproval(id, {
    kind: "tool_action",
    timeoutMs: ACTION_APPROVAL_TIMEOUT_MS,
    timeoutDefault: false,
  });
}

export function registerCheckpoint(id: string): Promise<boolean> {
  return registerApproval(id, {
    kind: "group_checkpoint",
    timeoutMs: CHECKPOINT_TIMEOUT_MS,
    timeoutDefault: true,
  });
}

export function resolveApproval(id: string, approved: boolean): boolean {
  const entry = registry.get(id);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  registry.delete(id);
  entry.resolve(approved);
  return true;
}

export function resolveCheckpoint(id: string, approved: boolean): boolean {
  return resolveApproval(id, approved);
}
