import { startBackgroundWorkers } from "../src/server/workers/start";
import { logger } from "../src/server/observability/logger";

process.env.AGENTHUB_WORKER_MODE = process.env.AGENTHUB_WORKER_MODE || "dedicated";

void startBackgroundWorkers().catch((error) => {
  logger.error({ err: error }, "AgentHub worker process failed to start");
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "AgentHub worker process shutting down");
    process.exit(0);
  });
}
