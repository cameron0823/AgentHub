import { isSentryConfigured } from "@/server/observability/sentry-config";
import { getQueueMetrics } from "@/server/queues";

export const runtime = "nodejs";

function escapeLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function metricLine(name: string, value: string | number, labels?: Record<string, string | number | boolean>) {
  const labelText =
    labels && Object.keys(labels).length > 0
      ? `{${Object.entries(labels)
          .map(([key, labelValue]) => `${key}="${escapeLabel(String(labelValue))}"`)
          .join(",")}}`
      : "";
  return `${name}${labelText} ${value}`;
}

export async function GET() {
  const memory = process.memoryUsage();
  const workersEnabled = process.env.AGENTHUB_DISABLE_BACKGROUND_WORKERS === "1" ? 0 : 1;
  const version = process.env.AGENTHUB_VERSION ?? "dev";
  const lines = [
    "# HELP agenthub_info Static AgentHub build information.",
    "# TYPE agenthub_info gauge",
    metricLine("agenthub_info", 1, { version }),
    "# HELP agenthub_process_uptime_seconds Process uptime in seconds.",
    "# TYPE agenthub_process_uptime_seconds gauge",
    metricLine("agenthub_process_uptime_seconds", process.uptime().toFixed(3)),
    "# HELP agenthub_process_memory_rss_bytes Resident set size in bytes.",
    "# TYPE agenthub_process_memory_rss_bytes gauge",
    metricLine("agenthub_process_memory_rss_bytes", memory.rss),
    "# HELP agenthub_nodejs_heap_used_bytes Node.js heap used in bytes.",
    "# TYPE agenthub_nodejs_heap_used_bytes gauge",
    metricLine("agenthub_nodejs_heap_used_bytes", memory.heapUsed),
    "# HELP agenthub_background_workers_enabled Background worker startup flag.",
    "# TYPE agenthub_background_workers_enabled gauge",
    metricLine("agenthub_background_workers_enabled", workersEnabled),
    "# HELP agenthub_sentry_configured Sentry optional integration configuration flag.",
    "# TYPE agenthub_sentry_configured gauge",
    metricLine("agenthub_sentry_configured", isSentryConfigured() ? 1 : 0),
  ];

  try {
    const queueMetrics = await getQueueMetrics();
    lines.push("# HELP bullmq_jobs BullMQ jobs by queue and state.", "# TYPE bullmq_jobs gauge");
    for (const item of queueMetrics) {
      for (const [state, value] of Object.entries(item.counts)) {
        lines.push(metricLine("bullmq_jobs", value, { queue: item.queue, state }));
      }
    }
  } catch {
    lines.push(
      "# HELP bullmq_metrics_available BullMQ metric collection availability.",
      "# TYPE bullmq_metrics_available gauge",
      metricLine("bullmq_metrics_available", 0),
    );
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
