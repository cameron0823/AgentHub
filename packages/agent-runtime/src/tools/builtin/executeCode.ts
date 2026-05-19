import { spawn } from "child_process";
import { z } from "zod";
import { ToolDefinition } from "../registry";

export interface SandboxOutputResource {
  id: string;
  type: "file" | "chart" | "document";
  filename: string;
  url: string;
  mimeType: string;
  content?: string;
  sizeBytes: number;
  downloadable: boolean;
  chartSpec?: unknown;
  source: "sandbox";
  createdAt: string;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxToolResult extends SandboxResult {
  type: "sandbox_execution";
  sessionId: string;
  provider: "local-docker" | "cloud";
  language: "python";
  outputs: SandboxOutputResource[];
  charts: SandboxOutputResource[];
}

function parseChartMarkers(stdout: string, sessionId: string): SandboxOutputResource[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("AGENTHUB_CHART_JSON:"))
    .map((line) => {
      const content = line.slice("AGENTHUB_CHART_JSON:".length).trim();
      let chartSpec: unknown = content;
      try {
        chartSpec = JSON.parse(content);
      } catch {
        // Preserve raw chart content for debugging when JSON is malformed.
      }
      const id = crypto.randomUUID();
      return {
        id,
        type: "chart" as const,
        filename: `${id}.chart.json`,
        url: `agenthub://sandbox/${sessionId}/${id}.chart.json`,
        mimeType: "application/vnd.agenthub.chart+json",
        content,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        downloadable: true,
        chartSpec,
        source: "sandbox" as const,
        createdAt: new Date().toISOString(),
      };
    });
}

function createSandboxToolResult(result: SandboxResult, provider: "local-docker" | "cloud"): SandboxToolResult {
  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const outputs: SandboxOutputResource[] = [];

  if (result.stdout) {
    outputs.push({
      id: crypto.randomUUID(),
      type: "file",
      filename: "stdout.txt",
      url: `agenthub://sandbox/${sessionId}/stdout.txt`,
      mimeType: "text/plain",
      content: result.stdout,
      sizeBytes: Buffer.byteLength(result.stdout, "utf8"),
      downloadable: true,
      source: "sandbox",
      createdAt,
    });
  }
  if (result.stderr) {
    outputs.push({
      id: crypto.randomUUID(),
      type: "file",
      filename: "stderr.txt",
      url: `agenthub://sandbox/${sessionId}/stderr.txt`,
      mimeType: "text/plain",
      content: result.stderr,
      sizeBytes: Buffer.byteLength(result.stderr, "utf8"),
      downloadable: true,
      source: "sandbox",
      createdAt,
    });
  }

  const charts = parseChartMarkers(result.stdout, sessionId);
  outputs.push(...charts);

  return {
    type: "sandbox_execution",
    sessionId,
    provider,
    language: "python",
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    outputs,
    charts,
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

async function executePython(code: string): Promise<SandboxResult> {
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

async function executeCloudPython(code: string): Promise<SandboxResult> {
  const url = process.env.AGENTHUB_CLOUD_SANDBOX_URL;
  if (!url) throw new Error("AGENTHUB_CLOUD_SANDBOX_URL is not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: "python", code }),
  });
  if (!res.ok) throw new Error(`Cloud sandbox error: ${res.status}`);
  return (await res.json()) as SandboxResult;
}

export const executeCodeTool: ToolDefinition = {
  name: "execute_code",
  description:
    "Execute Python code and return sandbox output files/charts. Use AGENTHUB_CHART_JSON:<json> on stdout to return chart metadata.",
  parameters: z.object({
    code: z.string().describe("Python code to execute"),
    language: z.enum(["python"]).default("python"),
  }),
  execute: async ({ code }) => {
    const provider = process.env.AGENTHUB_SANDBOX_PROVIDER === "cloud" ? "cloud" : "local-docker";
    const result = provider === "cloud" ? await executeCloudPython(code) : await executePython(code);
    return createSandboxToolResult(result, provider);
  },
};
