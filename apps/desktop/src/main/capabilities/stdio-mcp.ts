import { createHash } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type StdioMcpStartRequest = {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  auditLogDir: string;
};

export type StdioMcpProcessStatus = "starting" | "running" | "stopped" | "error";

export type StdioMcpProcessInfo = {
  id: string;
  pid: number | null;
  status: StdioMcpProcessStatus;
  startedAt: string;
};

type ManagedStdioMcpProcess = StdioMcpProcessInfo & {
  child: ChildProcessWithoutNullStreams;
  auditLogDir: string;
};

const processes = new Map<string, ManagedStdioMcpProcess>();
const SIMPLE_COMMAND_RE = /^[A-Za-z0-9._+-]+$/;
const SHELL_METACHAR_RE = /[;&|$>`!(){}\[\]\r\n]/;

function hashValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sanitizeEnv(env: Record<string, string> | undefined) {
  if (!env) return undefined;
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value)]));
}

async function writeAuditEvent(
  auditLogDir: string,
  event: "start" | "stop" | "error",
  payload: Record<string, unknown>,
) {
  await mkdir(auditLogDir, { recursive: true });
  await appendFile(
    path.join(auditLogDir, "stdio-mcp-audit.jsonl"),
    `${JSON.stringify({ event, at: new Date().toISOString(), ...payload })}\n`,
    "utf8",
  );
}

export function validateCommandPath(command: string) {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("STDIO MCP command is required");
  }
  if (SHELL_METACHAR_RE.test(trimmed)) {
    throw new Error("STDIO MCP command contains forbidden shell metacharacters");
  }
  if (path.isAbsolute(trimmed) || SIMPLE_COMMAND_RE.test(trimmed)) {
    return trimmed;
  }
  throw new Error("STDIO MCP command must be an absolute path or executable name");
}

export function validateArgs(args: string[]) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error("STDIO MCP args must be a string array");
  }
  return args.map((arg) => String(arg));
}

export async function startStdioMcpProcess(request: StdioMcpStartRequest): Promise<StdioMcpProcessInfo> {
  if (processes.has(request.id)) {
    throw new Error("STDIO MCP process is already running");
  }

  const command = validateCommandPath(request.command);
  const args = validateArgs(request.args);
  const argsHash = hashValue(args);
  const child = spawn(command, args, {
    env: { ...process.env, ...sanitizeEnv(request.env) },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  const processInfo: ManagedStdioMcpProcess = {
    id: request.id,
    pid: child.pid ?? null,
    status: "starting",
    startedAt: new Date().toISOString(),
    child,
    auditLogDir: request.auditLogDir,
  };

  processes.set(request.id, processInfo);
  await writeAuditEvent(request.auditLogDir, "start", {
    id: request.id,
    pid: processInfo.pid,
    commandHash: hashValue(command),
    argsHash,
  });

  child.once("spawn", () => {
    processInfo.status = "running";
  });

  child.once("error", async (error) => {
    processInfo.status = "error";
    await writeAuditEvent(request.auditLogDir, "error", {
      id: request.id,
      pid: processInfo.pid,
      error: error.message,
    });
  });

  child.once("exit", async (code, signal) => {
    processes.delete(request.id);
    processInfo.status = code === 0 ? "stopped" : "error";
    await writeAuditEvent(request.auditLogDir, processInfo.status === "stopped" ? "stop" : "error", {
      id: request.id,
      pid: processInfo.pid,
      code,
      signal,
    });
  });

  return {
    id: processInfo.id,
    pid: processInfo.pid,
    status: processInfo.status,
    startedAt: processInfo.startedAt,
  };
}

export async function stopStdioMcpProcess(id: string) {
  const managedProcess = processes.get(id);
  if (!managedProcess) {
    return { ok: true as const, stopped: false };
  }

  managedProcess.child.kill();
  processes.delete(id);
  managedProcess.status = "stopped";
  await writeAuditEvent(managedProcess.auditLogDir, "stop", {
    id,
    pid: managedProcess.pid,
  });
  return { ok: true as const, stopped: true };
}

export function listStdioMcpProcesses(): StdioMcpProcessInfo[] {
  return Array.from(processes.values(), ({ id, pid, status, startedAt }) => ({
    id,
    pid,
    status,
    startedAt,
  }));
}
