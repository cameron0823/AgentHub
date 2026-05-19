import net from "node:net";
import postgres from "postgres";
import { dbDriver } from "@/server/db";
import { validateProviderBaseUrl } from "@/server/security/outbound";

export const runtime = "nodejs";

const DEFAULT_DATABASE_URL = "postgres://localhost:5432/agenthub";
const CHECK_TIMEOUT_MS = 1500;

type DependencyResult = {
  status: "healthy" | "unhealthy" | "not-configured";
  configured?: boolean;
  action?: "start-docker" | "open-settings" | "open-docs" | "retry";
  error?: string;
};

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/redis:\/\/\S+/gi, "[redacted]")
    .replace(/\/\/[^:\s/]+:[^@\s/]+@/g, "//[redacted]@")
    .slice(0, 240);
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkDatabase(): Promise<DependencyResult> {
  if (dbDriver === "pglite") {
    return { status: "healthy", configured: true };
  }

  const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const healthClient = postgres(databaseUrl, {
    max: 1,
    connect_timeout: Math.ceil(CHECK_TIMEOUT_MS / 1000),
    idle_timeout: 1,
  });

  try {
    await withTimeout(healthClient`select 1`, "database check");
    return { status: "healthy", configured: true };
  } catch (error) {
    return { status: "unhealthy", configured: true, action: "start-docker", error: sanitizeError(error) };
  } finally {
    await healthClient.end({ timeout: 1 }).catch(() => undefined);
  }
}

function firstConfigured(...names: string[]) {
  return names.map((name) => process.env[name]).find((value): value is string => Boolean(value));
}

function configuredHttpUrl(url: string, path = "") {
  const safeUrl = validateProviderBaseUrl(url, url);
  const parsed = new URL(safeUrl);
  if (path) {
    const target = new URL(path, parsed.origin);
    parsed.pathname = target.pathname;
    parsed.search = target.search;
  } else {
    parsed.search = "";
  }
  parsed.hash = "";
  return parsed.toString();
}

async function checkHttpEndpoint(
  url: string | undefined,
  options: { path?: string; action?: DependencyResult["action"]; headers?: HeadersInit } = {},
): Promise<DependencyResult> {
  if (!url) {
    return { status: "not-configured", configured: false, action: options.action ?? "open-settings" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const safeUrl = configuredHttpUrl(url, options.path);
    const response = await fetch(safeUrl, { headers: options.headers, signal: controller.signal });
    return response.ok
      ? { status: "healthy", configured: true }
      : { status: "unhealthy", configured: true, action: options.action ?? "retry", error: `HTTP ${response.status}` };
  } catch (error) {
    return { status: "unhealthy", configured: true, action: options.action ?? "retry", error: sanitizeError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseTcpTarget(url: string | undefined, fallbackPort?: number) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port ? Number(parsed.port) : fallbackPort,
    };
  } catch {
    const [host, port] = url.split(":");
    return { host: host || "localhost", port: port ? Number(port) : fallbackPort };
  }
}

async function checkTcpEndpoint(
  url: string | undefined,
  options: { fallbackPort?: number; action?: DependencyResult["action"] } = {},
): Promise<DependencyResult> {
  const target = parseTcpTarget(url, options.fallbackPort);
  const port = target?.port;
  if (!target || !port || Number.isNaN(port)) {
    return { status: "not-configured", configured: false, action: options.action ?? "open-settings" };
  }

  return new Promise<DependencyResult>((resolve) => {
    const socket = net.connect({ host: target.host, port });
    const finish = (result: DependencyResult) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish({
        status: "unhealthy",
        configured: true,
        action: options.action ?? "retry",
        error: "tcp dependency check timed out",
      });
    }, CHECK_TIMEOUT_MS);

    socket.once("connect", () => {
      finish({ status: "healthy", configured: true });
    });
    socket.once("error", (error) => {
      finish({
        status: "unhealthy",
        configured: true,
        action: options.action ?? "retry",
        error: sanitizeError(error),
      });
    });
  });
}

export async function GET() {
  const redisUrl =
    firstConfigured("REDIS_URL") ??
    (process.env.REDIS_HOST ? `${process.env.REDIS_HOST}:${process.env.REDIS_PORT ?? "6379"}` : undefined);
  const objectStorageUrl = firstConfigured("S3_ENDPOINT", "MINIO_ENDPOINT");
  const authIssuer = firstConfigured("AUTH_CASDOOR_ISSUER");
  const searchUrl = firstConfigured("SEARXNG_BASE_URL", "SEARXNG_URL");

  const services: Record<string, DependencyResult> = {
    database: await checkDatabase(),
    redis: await checkTcpEndpoint(redisUrl, { fallbackPort: 6379, action: "start-docker" }),
    objectStorage: await checkHttpEndpoint(objectStorageUrl, { path: "/minio/health/ready", action: "start-docker" }),
    auth: await checkTcpEndpoint(authIssuer, { fallbackPort: 8000, action: "open-docs" }),
    search: await checkHttpEndpoint(searchUrl, {
      path: "/search?q=agenthub&format=json",
      action: "open-docs",
      headers: { "X-Real-IP": "127.0.0.1" },
    }),
    ollama: await checkHttpEndpoint(firstConfigured("OLLAMA_URL", "OLLAMA_BASE_URL"), { path: "/api/tags" }),
    lmstudio: await checkHttpEndpoint(firstConfigured("LMSTUDIO_URL", "LMSTUDIO_BASE_URL"), { path: "/v1/models" }),
    vllm: await checkHttpEndpoint(firstConfigured("VLLM_URL", "VLLM_BASE_URL"), { path: "/v1/models" }),
  };

  const status = Object.values(services).some((service) => service.status === "unhealthy") ? "degraded" : "ok";
  return Response.json({ status, services });
}
