import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { LOOPBACK_HOST, selectDesktopPort } from "./ports";
import { waitForHttpHealth } from "./health";
import { getOrCreateDesktopAuthSecret } from "./auth-secret";

const REQUIRED_LOOPBACK_BIND = "127.0.0.1";
const DESKTOP_PORT_ENV = "AGENTHUB_DESKTOP_PORT";

export type DesktopWebServerRuntime = {
  origin: string;
  port: number | null;
  ownedProcess: boolean;
  mode: "external" | "development" | "production";
};

type DesktopWebServerOptions = {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
};

export class DesktopWebServerManager {
  private readonly repoRoot: string;
  private readonly env: NodeJS.ProcessEnv;
  private ownedProcess: ChildProcess | null = null;
  private runtime: DesktopWebServerRuntime | null = null;

  constructor(options: DesktopWebServerOptions) {
    this.repoRoot = options.repoRoot;
    this.env = options.env ?? process.env;
  }

  async start(): Promise<DesktopWebServerRuntime> {
    if (LOOPBACK_HOST !== REQUIRED_LOOPBACK_BIND) {
      throw new Error("AgentHub Desktop web server must bind to 127.0.0.1");
    }

    if (this.runtime) {
      return this.runtime;
    }

    const explicitWebUrl = this.env.AGENTHUB_WEB_URL;
    if (explicitWebUrl) {
      const origin = new URL(explicitWebUrl).origin;
      this.runtime = {
        origin,
        port: Number(new URL(origin).port) || null,
        ownedProcess: false,
        mode: "external",
      };
      await this.writeLog(`Using external AgentHub web URL ${origin}`);
      return this.runtime;
    }

    await this.writeLog(`Selecting AgentHub desktop web port from ${DESKTOP_PORT_ENV} or safe fallbacks`);
    const port = await selectDesktopPort(this.env);
    const origin = `http://${LOOPBACK_HOST}:${port}`;
    const mode = app.isPackaged ? "production" : "development";

    this.ownedProcess =
      mode === "production" ? await this.startProductionServer(port) : await this.startDevelopmentServer(port);

    this.runtime = {
      origin,
      port,
      ownedProcess: true,
      mode,
    };

    await waitForHttpHealth(origin);
    await this.writeLog(`AgentHub web server healthy at ${origin}`);
    return this.runtime;
  }

  async stop() {
    const processToStop = this.ownedProcess;
    if (!processToStop) {
      return;
    }

    this.ownedProcess = null;
    this.runtime = null;

    await this.writeLog("Stopping owned AgentHub web server process");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (!processToStop.killed) {
          processToStop.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      processToStop.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      processToStop.kill();
    });
  }

  getRuntime() {
    return this.runtime;
  }

  private async startDevelopmentServer(port: number) {
    const authEnv = await this.createAuthEnvironment(port);
    await this.writeLog(`Starting AgentHub web dev server on ${LOOPBACK_HOST}:${port}`);
    return this.spawnServer(
      "pnpm",
      ["-C", "apps/web", "exec", "next", "dev", "--hostname", LOOPBACK_HOST, "--port", String(port)],
      {
        PORT: String(port),
        HOSTNAME: LOOPBACK_HOST,
        ...authEnv,
        AGENTHUB_VERSION: app.getVersion(),
      },
    );
  }

  private async startProductionServer(port: number) {
    const authEnv = await this.createAuthEnvironment(port);
    const serverPath = path.join(process.resourcesPath, "web", "apps", "web", "server.js");
    await this.writeLog(`Starting packaged AgentHub web server from ${serverPath}`);
    return this.spawnServer(process.execPath, [serverPath], {
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: LOOPBACK_HOST,
      ...authEnv,
      AGENTHUB_VERSION: app.getVersion(),
      NODE_ENV: "production",
    });
  }

  private async createAuthEnvironment(port: number) {
    const origin = `http://${LOOPBACK_HOST}:${port}`;
    return {
      NEXTAUTH_URL: origin,
      AGENTHUB_DESKTOP_ORIGIN: origin,
      NEXTAUTH_SECRET: this.env.NEXTAUTH_SECRET ?? (await getOrCreateDesktopAuthSecret(app.getPath("userData"))),
      AUTH_TRUST_HOST: "true",
    };
  }

  private spawnServer(command: string, args: string[], extraEnv: NodeJS.ProcessEnv) {
    const child = spawn(command, args, {
      cwd: this.repoRoot,
      env: {
        ...process.env,
        ...this.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    child.stdout?.on("data", (chunk) => {
      void this.writeLog(String(chunk).trimEnd());
    });
    child.stderr?.on("data", (chunk) => {
      void this.writeLog(String(chunk).trimEnd());
    });
    child.once("exit", (code, signal) => {
      void this.writeLog(`AgentHub web server exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    });

    return child;
  }

  private async writeLog(message: string) {
    const logsPath = app.getPath("logs");
    await mkdir(logsPath, { recursive: true });
    await appendFile(
      path.join(logsPath, "agenthub-web-server.log"),
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8",
    );
  }
}
