import { EventEmitter } from "node:events";
import { Queue, type JobsOptions } from "bullmq";

const QUEUE_STATES = ["waiting", "active", "completed", "failed", "delayed", "paused"] as const;

export const queueConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};
export const queuePrefix = process.env.AGENTHUB_QUEUE_PREFIX ?? "bull";

export const queuesDisabled =
  process.env.AGENTHUB_DISABLE_BACKGROUND_WORKERS === "1" ||
  process.env.AGENTHUB_DISABLE_QUEUES === "1" ||
  process.env.NEXT_PHASE === "phase-production-build";

export const queueRetryOptions: Record<string, JobsOptions> = {
  "file-ingestion": { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
  "agent-flow": { attempts: 1 },
  "image-generation": { attempts: 5, backoff: { type: "fixed", delay: 10_000 } },
  export: { attempts: 3, backoff: { type: "exponential", delay: 2_000 } },
  "knowledge-indexing": { attempts: 3, backoff: { type: "exponential", delay: 2_000 } },
  "agent-tasks": { attempts: 1 },
  automations: { attempts: 1 },
};

export type QueueLike<T = unknown> = {
  readonly name: string;
  add(jobName: string, data: T, options?: JobsOptions): Promise<unknown>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
};

class DisabledQueue<T = unknown> implements QueueLike<T> {
  constructor(readonly name: string) {}

  async add() {
    throw new Error(`Queue "${this.name}" is disabled in this process.`);
  }

  async getJobCounts(...types: string[]) {
    const states = types.length > 0 ? types : [...QUEUE_STATES];
    return Object.fromEntries(states.map((state) => [state, 0]));
  }
}

export function createQueue<T = unknown>(name: keyof typeof queueRetryOptions | string): QueueLike<T> {
  if (queuesDisabled) {
    return new DisabledQueue<T>(name);
  }

  return new Queue<T>(name, {
    connection: queueConnection,
    prefix: queuePrefix,
    defaultJobOptions: queueRetryOptions[name] ?? { attempts: 1 },
  }) as unknown as QueueLike<T>;
}

export const fileIngestionQueue = createQueue("file-ingestion");
export const agentFlowQueue = createQueue("agent-flow");
export const imageGenerationQueue = createQueue("image-generation");
export const exportQueue = createQueue("export");
export const knowledgeIndexingQueue = createQueue("knowledge-indexing");

export type JobProgressEvent = {
  userId: string;
  queue: string;
  jobId: string;
  progress: number | object;
  message?: string;
};

export class JobProgressPublisher {
  private readonly events = new EventEmitter();

  publish(event: JobProgressEvent) {
    this.events.emit(`user:${event.userId}`, event);
    this.events.emit("progress", event);
  }

  subscribe(userId: string, listener: (event: JobProgressEvent) => void) {
    const channel = `user:${userId}`;
    this.events.on(channel, listener);
    return () => this.events.off(channel, listener);
  }
}

export const jobProgressPublisher = new JobProgressPublisher();

export async function getQueueMetrics() {
  const queues = [fileIngestionQueue, agentFlowQueue, imageGenerationQueue, exportQueue, knowledgeIndexingQueue];
  return Promise.all(
    queues.map(async (queue) => ({
      queue: queue.name,
      counts: await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
    })),
  );
}
