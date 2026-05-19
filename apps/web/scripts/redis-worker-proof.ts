import postgres from "postgres";

type AutomationQueue = {
  add(
    name: string,
    data: { automationId: string; runId: string },
    options?: { removeOnComplete?: boolean; removeOnFail?: boolean },
  ): Promise<{ id?: string | number }>;
  obliterate?: (options: { force: boolean }) => Promise<void>;
  client?: Promise<{ keys: (pattern: string) => Promise<string[]>; del: (...keys: string[]) => Promise<number> }>;
  close?: () => Promise<void>;
};

type AutomationWorker = {
  close: () => Promise<void>;
};

type AutomationWorkerModule = {
  automationQueue: AutomationQueue;
  startAutomationWorker: () => AutomationWorker;
};

const databaseUrl = process.env.DATABASE_URL || "postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e";
const sql = postgres(databaseUrl, { max: 3, connect_timeout: 5, idle_timeout: 5 });

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getE2EUserId() {
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, name, role)
    values ('redis-worker-e2e@localhost', 'E2E Redis Worker', 'admin')
    on conflict (email) do update set updated_at = now()
    returning id
  `;
  return user.id;
}

async function cleanup() {
  await sql`
    delete from automation_runs
    where automation_id in (
      select id from automations where name like 'E2E Redis Worker Proof %'
    )
  `;
  await sql`delete from automations where name like 'E2E Redis Worker Proof %'`;
}

async function seedAutomationRun() {
  const userId = await getE2EUserId();
  const name = `E2E Redis Worker Proof ${Date.now()}`;
  const [automation] = await sql<{ id: string }[]>`
    insert into automations (
      user_id,
      name,
      prompt,
      cron_expression,
      timezone,
      max_executions,
      execution_count,
      is_active
    )
    values (${userId}, ${name}, 'Do not execute; max execution proof only.', '0 0 1 1 *', 'UTC', 0, 0, true)
    returning id
  `;
  const [run] = await sql<{ id: string }[]>`
    insert into automation_runs (automation_id, status, started_at)
    values (${automation.id}, 'pending', now())
    returning id
  `;

  return { automationId: automation.id, runId: run.id };
}

async function waitForProcessedRun(runId: string) {
  const deadline = Date.now() + 20_000;
  let lastObserved: unknown = null;
  while (Date.now() < deadline) {
    const [row] = await sql<
      Array<{
        status: string;
        error: string | null;
        completedAt: Date | null;
        isActive: boolean;
        pauseReason: string | null;
      }>
    >`
      select
        automation_runs.status,
        automation_runs.error,
        automation_runs.completed_at as "completedAt",
        automations.is_active as "isActive",
        automations.pause_reason as "pauseReason"
      from automation_runs
      inner join automations on automations.id = automation_runs.automation_id
      where automation_runs.id = ${runId}
      limit 1
    `;
    lastObserved = row ?? null;

    if (
      row?.status === "error" &&
      row.error === "Automation maxExecutions limit reached" &&
      row.completedAt &&
      row.isActive === false &&
      row.pauseReason === "max_executions_reached"
    ) {
      return row;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for Redis-backed automation job ${runId} to be processed; last observed state: ${JSON.stringify(
      lastObserved,
    )}`,
  );
}

async function cleanupProofRedisKeys(queue: AutomationQueue) {
  const client = await queue.client;
  if (!client) return;
  const keys = await client.keys("agenthub-proof-*");
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

async function main() {
  delete process.env.AGENTHUB_DISABLE_BACKGROUND_WORKERS;
  delete process.env.AGENTHUB_DISABLE_QUEUES;
  delete process.env.NEXT_PHASE;
  process.env.AGENTHUB_QUEUE_PREFIX = `agenthub-proof-${Date.now()}`;

  await cleanup();
  const workerModuleImport = await import("../src/server/workers/automationWorker");
  const workerModule = ((workerModuleImport as { default?: AutomationWorkerModule }).default ??
    workerModuleImport) as AutomationWorkerModule;
  const worker = workerModule.startAutomationWorker();

  try {
    const seeded = await seedAutomationRun();
    const job = await workerModule.automationQueue.add("run", seeded, {
      removeOnComplete: true,
      removeOnFail: true,
    });
    const processed = await waitForProcessedRun(seeded.runId);

    console.log(
      JSON.stringify(
        {
          status: "ok",
          redis: `${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`,
          queue: "automations",
          queuePrefix: process.env.AGENTHUB_QUEUE_PREFIX,
          jobId: job.id,
          automationId: seeded.automationId,
          runId: seeded.runId,
          persisted: processed,
        },
        null,
        2,
      ),
    );
  } finally {
    await worker.close();
    await workerModule.automationQueue.obliterate?.({ force: true }).catch(() => undefined);
    await cleanupProofRedisKeys(workerModule.automationQueue).catch(() => undefined);
    await workerModule.automationQueue.close?.();
    await cleanup();
    await sql.end({ timeout: 1 });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await sql.end({ timeout: 1 }).catch(() => undefined);
    process.exit(1);
  });
