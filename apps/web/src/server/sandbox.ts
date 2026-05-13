import { spawn } from "child_process";

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function executePython(code: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const proc = spawn("docker", [
      "run", "--rm",
      "--network", "none",
      "--read-only",
      "--tmpfs", "/tmp:size=50m",
      "--memory", "256m",
      "--cpus", "0.5",
      "-i",
      "python:3.11-slim",
      "python", "-",
    ]);

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({ stdout, stderr: "Execution timed out (30s)", exitCode: 124 });
    }, 30000);

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

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
