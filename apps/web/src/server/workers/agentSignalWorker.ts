import cron from "node-cron";
import { generateScheduledDailyBriefs } from "../daily-brief";
import { AGENT_SIGNAL_CRON, runAgentSignalForAllUsers } from "../agent-signal";

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export function startAgentSignalWorker() {
  if (scheduledTask) return scheduledTask;

  const timezone = process.env.AGENT_SIGNAL_TIMEZONE || process.env.DAILY_BRIEF_TIMEZONE || "UTC";
  scheduledTask = cron.schedule(
    AGENT_SIGNAL_CRON,
    () => {
      void runAgentSignalForAllUsers().then(() => generateScheduledDailyBriefs());
    },
    { timezone },
  );

  return scheduledTask;
}
