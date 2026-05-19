import { logger } from "../observability/logger";

let started = false;

export function shouldStartInlineWorkers(env: NodeJS.ProcessEnv = process.env) {
  return env.AGENTHUB_WORKER_MODE === "inline" || env.AGENTHUB_ENABLE_INLINE_WORKERS === "1";
}

export async function startBackgroundWorkers() {
  if (started) {
    logger.info("AgentHub background workers already started in this process");
    return false;
  }

  started = true;
  const { startAutomationWorker } = await import("./automationWorker");
  const { startTaskWorker } = await import("./taskWorker");
  const { startDailyBriefWorker } = await import("./dailyBriefWorker");
  const { startAgentSignalWorker } = await import("./agentSignalWorker");

  startAutomationWorker();
  startTaskWorker();
  startDailyBriefWorker();
  startAgentSignalWorker();
  logger.info("AgentHub background workers started");
  return true;
}
