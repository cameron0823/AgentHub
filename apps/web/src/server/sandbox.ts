import { spawn } from "child_process";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { resources } from "./db/schema";

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const SANDBOX_OUTPUT_TTL_MS = Number(process.env.SANDBOX_OUTPUT_TTL_MS ?? 24 * 60 * 60 * 1000);

export type SandboxOutputType = "file" | "chart" | "document";

export interface SandboxOutput {
  id?: string;
  type: SandboxOutputType;
  filename: string;
  url?: string;
  uri?: string;
  mimeType: string;
  content?: string;
  sizeBytes?: number;
  downloadable?: boolean;
  chartSpec?: unknown;
  source?: "sandbox";
  createdAt?: string;
  toolCallId?: string;
}

export interface SandboxSession {
  id: string;
  provider: string;
  language: "python" | "javascript" | "typescript";
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  outputs: SandboxOutput[];
  charts: SandboxOutput[];
  createdAt: string;
  expiresAt: string;
}

export interface PersistedSandboxResource {
  id: string;
  type: SandboxOutputType;
  url: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  content?: string;
  downloadable: boolean;
  source: "sandbox";
  createdAt: string;
  sessionId: string;
  chartSpec?: unknown;
  toolCallId?: string;
}

function byteLength(value: string | undefined) {
  return value ? Buffer.byteLength(value, "utf8") : 0;
}

function isSandboxOutputType(value: unknown): value is SandboxOutputType {
  return value === "file" || value === "chart" || value === "document";
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function outputUri(sessionId: string, output: Pick<SandboxOutput, "filename" | "url" | "uri">) {
  return output.url || output.uri || `agenthub://sandbox/${sessionId}/${encodeURIComponent(output.filename)}`;
}

function normalizeOutput(sessionId: string, output: unknown): SandboxOutput | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const type = isSandboxOutputType(record.type) ? record.type : null;
  const filename =
    typeof record.filename === "string" && record.filename.trim()
      ? record.filename.trim()
      : type === "chart"
        ? "chart.json"
        : "output.txt";
  const mimeType =
    typeof record.mimeType === "string" && record.mimeType.trim()
      ? record.mimeType.trim()
      : type === "chart"
        ? "application/vnd.agenthub.chart+json"
        : "text/plain";
  if (!type) return null;
  const content = typeof record.content === "string" ? record.content : undefined;
  const normalized: SandboxOutput = {
    id: typeof record.id === "string" ? record.id : crypto.randomUUID(),
    type,
    filename,
    url: typeof record.url === "string" ? record.url : undefined,
    uri: typeof record.uri === "string" ? record.uri : undefined,
    mimeType,
    content,
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : byteLength(content),
    downloadable: typeof record.downloadable === "boolean" ? record.downloadable : true,
    chartSpec: record.chartSpec,
    source: "sandbox",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    toolCallId: typeof record.toolCallId === "string" ? record.toolCallId : undefined,
  };
  normalized.url = outputUri(sessionId, normalized);
  return normalized;
}

function uniqOutputs(outputs: SandboxOutput[]) {
  const byKey = new Map<string, SandboxOutput>();
  for (const output of outputs) {
    byKey.set(output.id || output.url || output.filename, output);
  }
  return Array.from(byKey.values());
}

export function createSandboxSession(
  input: Partial<SandboxSession> & { id?: string; outputs?: unknown[]; charts?: unknown[] } = {},
): SandboxSession {
  const id = input.id || crypto.randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();
  const expiresAt = input.expiresAt || new Date(Date.parse(createdAt) + SANDBOX_OUTPUT_TTL_MS).toISOString();
  const outputs = (input.outputs ?? [])
    .map((output) => normalizeOutput(id, output))
    .filter((output): output is SandboxOutput => Boolean(output));
  const charts = (input.charts ?? [])
    .map((output) => normalizeOutput(id, output))
    .filter((output): output is SandboxOutput => Boolean(output));
  const allOutputs = uniqOutputs([...outputs, ...charts]);

  return {
    id,
    provider: input.provider || "local-docker",
    language: input.language || "python",
    stdout: input.stdout,
    stderr: input.stderr,
    exitCode: input.exitCode,
    outputs: allOutputs,
    charts: allOutputs.filter((output) => output.type === "chart"),
    createdAt,
    expiresAt,
  };
}

export function createSandboxSessionFromToolResult(result: unknown): SandboxSession | null {
  if (!result || typeof result !== "object" || (result as { type?: unknown }).type !== "sandbox_execution") {
    return null;
  }
  const record = result as Record<string, unknown>;
  return createSandboxSession({
    id: typeof record.sessionId === "string" ? record.sessionId : undefined,
    provider: typeof record.provider === "string" ? record.provider : "local-docker",
    language: record.language === "javascript" || record.language === "typescript" ? record.language : "python",
    stdout: typeof record.stdout === "string" ? record.stdout : undefined,
    stderr: typeof record.stderr === "string" ? record.stderr : undefined,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : undefined,
    outputs: Array.isArray(record.outputs) ? record.outputs : [],
    charts: Array.isArray(record.charts) ? record.charts : [],
  });
}

export function sandboxResourcesFromSession(sandboxSession: SandboxSession): PersistedSandboxResource[] {
  return sandboxSession.outputs.map((output) => ({
    id: isUuid(output.id) ? output.id : crypto.randomUUID(),
    type: output.type,
    url: outputUri(sandboxSession.id, output),
    mimeType: output.mimeType,
    filename: output.filename,
    sizeBytes: output.sizeBytes ?? byteLength(output.content),
    content: output.content,
    downloadable: output.downloadable ?? true,
    source: "sandbox" as const,
    createdAt: output.createdAt || sandboxSession.createdAt,
    sessionId: sandboxSession.id,
    chartSpec: output.chartSpec,
    toolCallId: output.toolCallId,
  }));
}

function resourceFromRow(row: typeof resources.$inferSelect): PersistedSandboxResource {
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const filename = typeof metadata.filename === "string" ? metadata.filename : row.prompt || "sandbox-output";
  const content = typeof metadata.content === "string" ? metadata.content : undefined;
  return {
    id: row.id,
    type: isSandboxOutputType(row.type) ? row.type : "file",
    url: row.uri,
    mimeType: row.mimeType,
    filename,
    sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : byteLength(content),
    content,
    downloadable: typeof metadata.downloadable === "boolean" ? metadata.downloadable : true,
    source: "sandbox",
    createdAt: row.createdAt.toISOString(),
    sessionId: typeof metadata.sessionId === "string" ? metadata.sessionId : row.sessionId,
    chartSpec: metadata.chartSpec,
    toolCallId: typeof metadata.toolCallId === "string" ? metadata.toolCallId : undefined,
  };
}

export function sandboxResourceFromResourceRow(row: typeof resources.$inferSelect): PersistedSandboxResource {
  return resourceFromRow(row);
}

export async function persistSandboxOutputs(input: {
  userId: string;
  sessionId: string;
  sourceMessageId: string;
  sandboxSession: SandboxSession;
}): Promise<PersistedSandboxResource[]> {
  const sandboxResources = sandboxResourcesFromSession(input.sandboxSession);
  if (sandboxResources.length === 0) return [];

  const inserted = await db
    .insert(resources)
    .values(
      sandboxResources.map((output) => ({
        id: output.id,
        userId: input.userId,
        sessionId: input.sessionId,
        sourceMessageId: input.sourceMessageId,
        type: output.type,
        source: "sandbox",
        uri: output.url,
        mimeType: output.mimeType,
        prompt: output.filename,
        revisedPrompt: null,
        providerId: input.sandboxSession.provider,
        model: input.sandboxSession.language,
        metadata: {
          sessionId: input.sandboxSession.id,
          filename: output.filename,
          sizeBytes: output.sizeBytes,
          downloadable: output.downloadable,
          content: output.content,
          chartSpec: output.chartSpec,
          toolCallId: output.toolCallId,
          provider: input.sandboxSession.provider,
          language: input.sandboxSession.language,
          exitCode: input.sandboxSession.exitCode,
          expiresAt: input.sandboxSession.expiresAt,
        },
      })),
    )
    .returning();

  return inserted.map(resourceFromRow);
}

export async function downloadSandboxOutput(input: { userId: string; resourceId: string }) {
  const [row] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, input.resourceId), eq(resources.userId, input.userId), eq(resources.source, "sandbox")))
    .limit(1);

  if (!row) throw new Error("Sandbox output not found");
  const resource = resourceFromRow(row);
  return {
    id: resource.id,
    filename: resource.filename,
    mimeType: resource.mimeType,
    content: resource.content ?? "",
    url: resource.url,
    sizeBytes: resource.sizeBytes,
    downloadable: resource.downloadable,
  };
}

function dockerSecurityOptions() {
  const options: string[] = [];
  if (process.env.AGENTHUB_SANDBOX_SECCOMP_PROFILE) {
    options.push(`seccomp=${process.env.AGENTHUB_SANDBOX_SECCOMP_PROFILE}`);
  }
  if (process.env.AGENTHUB_SANDBOX_APPARMOR_PROFILE) {
    options.push(`apparmor=${process.env.AGENTHUB_SANDBOX_APPARMOR_PROFILE}`);
  }
  return options.flatMap((option) => ["--security-opt", option]);
}

function dockerSandboxArgs(image: string) {
  return [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    ...dockerSecurityOptions(),
    "--tmpfs",
    "/tmp:size=50m,noexec,nosuid,nodev",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--ulimit",
    "nofile=64:64",
    "--ulimit",
    "nproc=64:64",
    "-i",
    image,
    "python",
    "-",
  ];
}

export async function executePython(code: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const image = process.env.AGENTHUB_SANDBOX_IMAGE || "python:3.11-slim";
    const proc = spawn("docker", dockerSandboxArgs(image));

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ stdout, stderr: "Execution timed out (30s)", exitCode: 124 });
    }, 30000);

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    if (proc.stdin) {
      proc.stdin.write(code);
      proc.stdin.end();
    }

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}
