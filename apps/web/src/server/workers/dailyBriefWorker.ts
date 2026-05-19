import cron from "node-cron";
import { DAILY_BRIEF_CRON, generateScheduledDailyBriefs } from "../daily-brief";

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export function startDailyBriefWorker() {
  if (scheduledTask) return scheduledTask;

  const timezone = process.env.DAILY_BRIEF_TIMEZONE || "UTC";
  scheduledTask = cron.schedule(
    DAILY_BRIEF_CRON,
    () => {
      void generateScheduledDailyBriefs();
    },
    { timezone },
  );

  return scheduledTask;
}
