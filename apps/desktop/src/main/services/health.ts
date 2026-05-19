export type HealthCheckResult = { ok: true; status: number } | { ok: false; status?: number; error: string };

export async function checkHttpHealth(origin: string, timeoutMs = 1500): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: controller.signal,
    });

    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: `Health returned ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForHttpHealth(origin: string, timeoutMs = 45_000, intervalMs = 500) {
  const startedAt = Date.now();
  let lastResult: HealthCheckResult = { ok: false, error: "Health check has not run" };

  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await checkHttpHealth(origin);
    if (lastResult.ok) {
      return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(lastResult.ok ? "Timed out waiting for AgentHub web health" : lastResult.error);
}
