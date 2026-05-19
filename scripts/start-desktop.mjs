#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const defaultServices = ["network", "postgresql", "redis", "minio", "minio-init", "casdoor", "searxng"];
const defaultDatabaseUrl = "postgres://agenthub:agenthub_password@localhost:5432/agenthub";
const waitTimeoutMs = Number(process.env.AGENTHUB_DESKTOP_START_TIMEOUT_MS ?? "90000");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipInstall = args.has("--skip-install");
const skipServices = args.has("--skip-services");
const skipMigrate = args.has("--skip-migrate");
const skipLaunch = args.has("--skip-launch");
const portBindings = [
  { envName: "AGENTHUB_HOST_PORT", defaultPort: 3000, label: "AgentHub container" },
  { envName: "POSTGRES_HOST_PORT", defaultPort: 5432, label: "PostgreSQL" },
  { envName: "REDIS_HOST_PORT", defaultPort: 6379, label: "Redis" },
  { envName: "CASDOOR_HOST_PORT", defaultPort: 8000, label: "Casdoor" },
  { envName: "SEARXNG_HOST_PORT", defaultPort: 8080, label: "SearXNG" },
  { envName: "MINIO_HOST_PORT", defaultPort: 9000, label: "MinIO API" },
  { envName: "MINIO_CONSOLE_HOST_PORT", defaultPort: 9001, label: "MinIO Console" },
  { envName: "OLLAMA_HOST_PORT", defaultPort: 11434, label: "Ollama bridge" },
];

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function parseEnvFile(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!key || key.startsWith("export ")) {
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function createStartupEnv() {
  const fileEnv = {
    ...parseEnvFile(".env"),
    ...parseEnvFile(".env.local"),
    ...parseEnvFile("apps/web/.env"),
    ...parseEnvFile("apps/web/.env.local"),
  };

  return {
    ...fileEnv,
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? fileEnv.DATABASE_URL ?? defaultDatabaseUrl,
    AGENTHUB_WORKER_MODE: process.env.AGENTHUB_WORKER_MODE ?? "inline",
    AGENTHUB_ENABLE_INLINE_WORKERS: process.env.AGENTHUB_ENABLE_INLINE_WORKERS ?? "1",
    AGENTHUB_ENABLE_DEV_LOGIN: process.env.AGENTHUB_ENABLE_DEV_LOGIN ?? "1",
    E2E_ENABLE_DEV_LOGIN: process.env.E2E_ENABLE_DEV_LOGIN ?? "1",
    ELECTRON_DISABLE_SECURITY_WARNINGS: process.env.ELECTRON_DISABLE_SECURITY_WARNINGS ?? "false",
  };
}

const startupEnv = createStartupEnv();

function parsePort(value, envName) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${envName}: ${value}`);
  }
  return port;
}

async function isHostPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(preferredPort, reservedPorts) {
  const candidates = [
    preferredPort,
    preferredPort + 10000,
    preferredPort + 11000,
    preferredPort + 12000,
    preferredPort + 13000,
  ].filter((port) => port <= 65535);

  for (const candidate of candidates) {
    if (!reservedPorts.has(candidate) && (await isHostPortAvailable(candidate))) {
      return candidate;
    }
  }

  for (let candidate = 20000; candidate <= 65535; candidate += 1) {
    if (!reservedPorts.has(candidate) && (await isHostPortAvailable(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not find a free host port near ${preferredPort}`);
}

async function getExistingComposeHostPort(containerPort) {
  try {
    const { stdout } = await run("docker", ["compose", "port", "network", String(containerPort)], {
      capture: true,
      label: `checking existing AgentHub host port for ${containerPort}`,
      quiet: true,
    });
    const [firstLine] = stdout.trim().split(/\r?\n/).filter(Boolean);
    const match = firstLine?.match(/:(\d+)$/);
    return match ? parsePort(match[1], `existing AgentHub host port for ${containerPort}`) : null;
  } catch {
    return null;
  }
}

async function hasExistingComposeService(serviceName) {
  try {
    const { stdout } = await run("docker", ["compose", "ps", "-q", serviceName], {
      capture: true,
      label: `checking existing AgentHub compose service ${serviceName}`,
      quiet: true,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function getServicesToStart() {
  const services = [...defaultServices];
  if (!dryRun && (await hasExistingComposeService("agenthub"))) {
    services.push("agenthub");
  }
  return services;
}

function withPort(rawUrl, fallbackUrl, port) {
  const url = new URL(rawUrl || fallbackUrl);
  url.hostname = url.hostname || "localhost";
  url.port = String(port);
  return url.origin;
}

function databaseUrlWithPort(rawUrl, port) {
  const url = new URL(rawUrl || defaultDatabaseUrl);
  url.hostname = url.hostname || "localhost";
  url.port = String(port);
  return url.toString();
}

function databaseUrlWithQuietMigrations(rawUrl) {
  const url = new URL(rawUrl || defaultDatabaseUrl);
  if (!url.searchParams.has("options")) {
    url.searchParams.set("options", "-c client_min_messages=warning");
  }
  return url.toString();
}

function applyRuntimePortEnvironment() {
  if (!process.env.DATABASE_URL) {
    startupEnv.DATABASE_URL = databaseUrlWithPort(startupEnv.DATABASE_URL, startupEnv.POSTGRES_HOST_PORT);
  }
  if (!process.env.REDIS_URL) {
    startupEnv.REDIS_URL = `redis://localhost:${startupEnv.REDIS_HOST_PORT}`;
  }
  if (!process.env.REDIS_HOST) {
    startupEnv.REDIS_HOST = "localhost";
  }
  if (!process.env.REDIS_PORT) {
    startupEnv.REDIS_PORT = String(startupEnv.REDIS_HOST_PORT);
  }
  if (!process.env.S3_ENDPOINT && !process.env.MINIO_ENDPOINT) {
    startupEnv.S3_ENDPOINT = withPort(startupEnv.S3_ENDPOINT, "http://localhost:9000", startupEnv.MINIO_HOST_PORT);
    startupEnv.MINIO_ENDPOINT = startupEnv.S3_ENDPOINT;
  }
  if (!process.env.AUTH_CASDOOR_ISSUER) {
    startupEnv.AUTH_CASDOOR_ISSUER = withPort(
      startupEnv.AUTH_CASDOOR_ISSUER,
      "http://localhost:8000",
      startupEnv.CASDOOR_HOST_PORT,
    );
  }
  if (!process.env.SEARXNG_BASE_URL && !process.env.SEARXNG_URL) {
    startupEnv.SEARXNG_BASE_URL = withPort(
      startupEnv.SEARXNG_BASE_URL,
      "http://localhost:8080",
      startupEnv.SEARXNG_HOST_PORT,
    );
  }
}

async function configureHostPorts() {
  if (skipServices || dryRun) {
    for (const binding of portBindings) {
      startupEnv[binding.envName] = String(
        parsePort(startupEnv[binding.envName] ?? binding.defaultPort, binding.envName),
      );
    }
    applyRuntimePortEnvironment();
    return;
  }

  const reservedPorts = new Set();
  for (const binding of portBindings) {
    const configuredPort = parsePort(startupEnv[binding.envName] ?? binding.defaultPort, binding.envName);
    const configuredByShell = Object.prototype.hasOwnProperty.call(process.env, binding.envName);
    const existingPort = await getExistingComposeHostPort(binding.defaultPort);
    let selectedPort = configuredPort;

    if (existingPort && !reservedPorts.has(existingPort) && (!configuredByShell || existingPort === configuredPort)) {
      startupEnv[binding.envName] = String(existingPort);
      reservedPorts.add(existingPort);
      continue;
    }

    if (!(await isHostPortAvailable(configuredPort))) {
      if (configuredByShell) {
        throw new Error(`${binding.label} host port ${configuredPort} from ${binding.envName} is already in use.`);
      }

      selectedPort = await findAvailablePort(configuredPort, reservedPorts);
      log(`${binding.label} host port ${configuredPort} is in use; using ${selectedPort} via ${binding.envName}.`);
    }

    startupEnv[binding.envName] = String(selectedPort);
    reservedPorts.add(selectedPort);
  }

  applyRuntimePortEnvironment();
}

function describe(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function run(command, commandArgs, options = {}) {
  const label = options.label ?? describe(command, commandArgs);
  if (!options.quiet) {
    log(`\n> ${label}`);
  }

  if (dryRun) {
    if (!options.quiet) {
      log(`[dry-run] ${describe(command, commandArgs)}`);
    }
    return Promise.resolve({ stdout: "", stderr: "", status: 0 });
  }

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? startupEnv,
      shell: process.platform === "win32",
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (options.capture) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.once("error", reject);
    child.once("exit", (status, signal) => {
      if (signal) {
        reject(new Error(`${label} exited from signal ${signal}`));
        return;
      }
      if (status !== 0) {
        reject(new Error(`${label} exited with status ${status ?? "unknown"}${stderr ? `\n${stderr.trim()}` : ""}`));
        return;
      }
      resolve({ stdout, stderr, status: status ?? 0 });
    });
  });
}

function runForeground(command, commandArgs, options = {}) {
  const label = options.label ?? describe(command, commandArgs);
  log(`\n> ${label}`);

  if (dryRun) {
    log(`[dry-run] ${describe(command, commandArgs)}`);
    return Promise.resolve(0);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? startupEnv,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    child.once("error", reject);
    child.once("exit", (status, signal) => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
      if (signal) {
        resolve(0);
        return;
      }
      resolve(status ?? 0);
    });
  });
}

async function ensureCommand(command, commandArgs, failureHint) {
  try {
    await run(command, commandArgs, { capture: true, label: `checking ${command}` });
  } catch (error) {
    throw new Error(`${failureHint}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForPostgres() {
  if (skipServices || dryRun) {
    return;
  }

  const user = startupEnv.POSTGRES_USER || "agenthub";
  const database = startupEnv.POSTGRES_DB || "agenthub";
  const start = Date.now();
  let lastError = "";
  log("\n> waiting for PostgreSQL to accept connections");

  while (Date.now() - start < waitTimeoutMs) {
    try {
      await run("docker", ["compose", "exec", "-T", "postgresql", "pg_isready", "-U", user, "-d", database], {
        capture: true,
        label: "postgres readiness probe",
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw new Error(`PostgreSQL was not ready within ${waitTimeoutMs}ms.\n${lastError}`);
}

async function maybeInstallDependencies() {
  if (skipInstall || existsSync(path.join(repoRoot, "node_modules", ".pnpm"))) {
    return;
  }

  await run("pnpm", ["install", "--frozen-lockfile"], {
    label: "installing workspace dependencies",
  });
}

async function main() {
  log("AgentHub Desktop one-step startup");
  log(`repo: ${repoRoot}`);

  await ensureCommand("pnpm", ["--version"], "pnpm is required. Enable it with: corepack enable");

  await maybeInstallDependencies();

  if (!skipServices) {
    await ensureCommand(
      "docker",
      ["compose", "version"],
      "Docker Compose is required to start AgentHub local services.",
    );
    await configureHostPorts();
    await run("docker", ["compose", "up", "-d", ...(await getServicesToStart())], {
      label: "starting AgentHub Docker services",
    });
    await waitForPostgres();
  } else {
    await configureHostPorts();
  }

  if (!skipMigrate) {
    await run("pnpm", ["db:migrate"], {
      label: "applying database migrations",
      env: {
        ...startupEnv,
        DATABASE_URL: databaseUrlWithQuietMigrations(startupEnv.DATABASE_URL),
        PGOPTIONS: startupEnv.PGOPTIONS ?? "--client-min-messages=warning",
      },
    });
  }

  if (skipLaunch) {
    log("\nAgentHub Desktop launch skipped by --skip-launch.");
    return;
  }

  const status = await runForeground("pnpm", ["-C", "apps/desktop", "dev"], {
    label: "launching AgentHub Desktop",
  });
  process.exit(status);
}

main().catch((error) => {
  log("");
  log("AgentHub Desktop startup failed.");
  log(error instanceof Error ? error.message : String(error));
  log("");
  log("Useful options:");
  log("  pnpm desktop -- --dry-run");
  log("  pnpm desktop -- --skip-install");
  log("  pnpm desktop -- --skip-services");
  log("  pnpm desktop -- --skip-migrate");
  log("  pnpm desktop -- --skip-launch");
  process.exit(1);
});
