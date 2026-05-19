export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./server/observability/logger");
    const { initializeSentry } = await import("./server/observability/sentry");
    const sentryInitialized = await initializeSentry();
    logger.info({ sentryInitialized }, "AgentHub node instrumentation starting");

    const { shouldStartInlineWorkers, startBackgroundWorkers } = await import("./server/workers/start");
    if (!shouldStartInlineWorkers()) {
      logger.info(
        "AgentHub background workers disabled in Next.js instrumentation; use `pnpm -C apps/web workers` or set AGENTHUB_WORKER_MODE=inline for local desktop use.",
      );
      return;
    }

    try {
      await startBackgroundWorkers();
    } catch (err) {
      logger.warn({ err }, "background workers failed to start");
    }
  }
}
