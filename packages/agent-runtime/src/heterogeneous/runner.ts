import { spawn } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import {
  HETEROGENEOUS_ALLOWED_COMMANDS_ENV,
  HETEROGENEOUS_ALLOWED_ENV_KEYS_ENV,
  HETEROGENEOUS_RUNNER_FEATURE_FLAG,
  HETEROGENEOUS_WORKSPACE_ROOT_ENV,
  type HeterogeneousAgentProfile,
  type HeterogeneousRunEvent,
  type HeterogeneousRunInput,
  type HeterogeneousRunnerOptions,
} from "./types";

const SHELL_METACHARS = /[;&|`$<>]/;

function splitEnvList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isHeterogeneousRuntimeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env[HETEROGENEOUS_RUNNER_FEATURE_FLAG] === "true";
}

export function validateCommandAllowlist(command: string, options: HeterogeneousRunnerOptions = {}) {
  if (!command || SHELL_METACHARS.test(command)) {
    throw new Error("Command contains unsupported shell metacharacters.");
  }
  const allowedCommands = options.allowedCommands ?? splitEnvList(options.env?.[HETEROGENEOUS_ALLOWED_COMMANDS_ENV]);
  if (!allowedCommands.includes(command)) {
    throw new Error("Command is not in the heterogeneous runtime allowlist.");
  }
  return command;
}

export function validateArgs(args: string[]) {
  for (const arg of args) {
    if (SHELL_METACHARS.test(arg)) {
      throw new Error("Argument contains unsupported shell metacharacters.");
    }
  }
  return args;
}

export function validateWorkingDirectory(
  workingDirectory: string | null | undefined,
  options: HeterogeneousRunnerOptions = {},
) {
  if (!workingDirectory) return undefined;
  const workspaceRoot = options.workspaceRoot ?? options.env?.[HETEROGENEOUS_WORKSPACE_ROOT_ENV];
  if (!workspaceRoot) throw new Error("Working directory requires AGENTHUB_HETERO_WORKSPACE_ROOT.");

  const root = resolve(workspaceRoot);
  const candidate = isAbsolute(workingDirectory) ? resolve(workingDirectory) : resolve(root, workingDirectory);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Working directory is outside the allowed workspace root.");
  }
  return candidate;
}

export function scopeEnvironment(profileEnv: Record<string, string>, options: HeterogeneousRunnerOptions = {}) {
  const env = options.env ?? process.env;
  const allowedKeys = new Set([
    "PATH",
    ...splitEnvList(env[HETEROGENEOUS_ALLOWED_ENV_KEYS_ENV]),
    ...(options.allowedEnvKeys ?? []),
  ]);
  const scoped: NodeJS.ProcessEnv = {
    NODE_ENV: env.NODE_ENV ?? process.env.NODE_ENV ?? "production",
  };

  for (const key of allowedKeys) {
    if (env[key] !== undefined) scoped[key] = env[key];
  }
  for (const [key, value] of Object.entries(profileEnv)) {
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    if (allowedKeys.has(key) || key.startsWith("AGENTHUB_")) scoped[key] = value;
  }

  return scoped;
}

function pushQueue<T>(queue: T[], resolveNext: ((value: T) => void) | null, value: T) {
  if (resolveNext) {
    resolveNext(value);
    return null;
  }
  queue.push(value);
  return null;
}

export async function* runHeterogeneousAgent(
  profile: HeterogeneousAgentProfile,
  input: HeterogeneousRunInput,
  options: HeterogeneousRunnerOptions = {},
): AsyncGenerator<HeterogeneousRunEvent> {
  const env = options.env ?? process.env;
  if (!isHeterogeneousRuntimeEnabled(env)) {
    yield {
      type: "status",
      status: "feature_disabled",
      message: `${HETEROGENEOUS_RUNNER_FEATURE_FLAG} must be true before native process execution is allowed.`,
    };
    return;
  }

  if (!profile.isEnabled) {
    yield { type: "status", status: "error", message: "Heterogeneous profile is disabled." };
    return;
  }

  const command = validateCommandAllowlist(profile.command, { ...options, env });
  const args = validateArgs([...(profile.args || []), ...(input.args || [])]);
  const cwd = validateWorkingDirectory(profile.workingDirectory, { ...options, env });
  const scopedEnv = scopeEnvironment(profile.env || {}, { ...options, env });

  yield { type: "status", status: "running", message: "Starting heterogeneous process." };

  const child = spawn(command, args, {
    cwd,
    env: scopedEnv,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const queue: Array<HeterogeneousRunEvent | null> = [];
  let resolveNext: ((value: HeterogeneousRunEvent | null) => void) | null = null;
  const enqueue = (value: HeterogeneousRunEvent | null) => {
    const resolver = resolveNext;
    resolveNext = pushQueue(queue, resolver, value);
  };
  const next = () => {
    if (queue.length > 0) return Promise.resolve(queue.shift() ?? null);
    return new Promise<HeterogeneousRunEvent | null>((resolvePromise) => {
      resolveNext = resolvePromise;
    });
  };

  const abortSignal: AbortSignal | undefined = options.signal;
  const abort = () => child.kill("SIGTERM");
  abortSignal?.addEventListener("abort", abort, { once: true });

  let timeout: NodeJS.Timeout | undefined;
  if (options.timeoutMs && options.timeoutMs > 0) {
    timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
  }

  child.stdout.on("data", (chunk) => enqueue({ type: "stdout", content: chunk.toString("utf8") }));
  child.stderr.on("data", (chunk) => enqueue({ type: "stderr", content: chunk.toString("utf8") }));
  child.on("error", (error) => {
    enqueue({ type: "status", status: "error", message: error.message });
    enqueue(null);
  });
  child.on("close", (exitCode, signal) => {
    enqueue({ type: "exit", exitCode, signal });
    enqueue(null);
  });

  if (input.stdin || input.prompt) {
    child.stdin.write(input.stdin ?? input.prompt);
  }
  child.stdin.end();

  try {
    while (true) {
      const event = await next();
      if (!event) break;
      yield event;
    }
  } finally {
    if (timeout) clearTimeout(timeout);
    abortSignal?.removeEventListener("abort", abort);
    if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  }
}
