import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type DrizzleJournal = {
  entries: Array<{
    idx: number;
    tag: string;
    when: number;
  }>;
};

type RuntimePgliteClient = {
  query<T>(query: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close?: () => Promise<void>;
};

const REQUIRED_TABLES = [
  "users",
  "chat_sessions",
  "messages",
  "document_chunks",
  "memory_entries",
  "workspaces",
  "graph_checkpoints",
  "graph_thread_states",
] as const;

const REQUIRED_INDEXES = ["embedding_index", "memory_entries_embedding_idx"] as const;

function sqlStringList(values: readonly string[]) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

async function resolveDataDir() {
  const configured = process.env.AGENTHUB_PGLITE_DATA_DIR || process.env.PGLITE_DATA_DIR;
  if (configured) {
    const dataDir = resolve(configured);
    if (process.env.AGENTHUB_PGLITE_RESET === "1") {
      await rm(dataDir, { recursive: true, force: true });
    }
    return { dataDir, cleanup: false };
  }

  return {
    dataDir: await mkdtemp(join(tmpdir(), "agenthub-pglite-smoke-")),
    cleanup: process.env.AGENTHUB_PGLITE_KEEP_DATA !== "1",
  };
}

async function readJournal(appRoot: string) {
  const journalPath = join(appRoot, "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as DrizzleJournal;
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

async function installRequiredExtensions(client: PGlite) {
  await client.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);
}

async function ensureMigrationJournal(client: PGlite) {
  await client.exec(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);
}

async function applyJournalMigrations(client: PGlite, appRoot: string) {
  const entries = await readJournal(appRoot);
  let applied = 0;

  for (const entry of entries) {
    const migrationPath = join(appRoot, "drizzle", `${entry.tag}.sql`);
    const rawSql = await readFile(migrationPath, "utf8");
    const hash = createHash("sha256").update(rawSql).digest("hex");
    const existing = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1) AS exists",
      [hash],
    );

    if (existing.rows[0]?.exists) continue;

    const sql = rawSql.replaceAll("--> statement-breakpoint", "").trim();
    if (sql) {
      await client.exec(sql);
    }
    await client.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [
      hash,
      entry.when,
    ]);
    applied += 1;
  }

  return { total: entries.length, applied };
}

async function assertSchema(client: PGlite) {
  const tableRows = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN (${sqlStringList(REQUIRED_TABLES)})
    ORDER BY table_name
  `);
  const tables = tableRows.rows.map((row) => row.table_name);
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  if (missingTables.length > 0) {
    throw new Error(`PGlite migration smoke missing tables: ${missingTables.join(", ")}`);
  }

  const indexRows = await client.query<{ indexname: string }>(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname IN (${sqlStringList(REQUIRED_INDEXES)})
    ORDER BY indexname
  `);
  const indexes = indexRows.rows.map((row) => row.indexname);
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !indexes.includes(index));
  if (missingIndexes.length > 0) {
    throw new Error(`PGlite migration smoke missing vector indexes: ${missingIndexes.join(", ")}`);
  }

  const migrationRows = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
  );
  const extensionRows = await client.query<{ extname: string }>(`
    SELECT extname
    FROM pg_extension
    WHERE extname IN ('vector', 'pg_trgm')
    ORDER BY extname
  `);

  return {
    tables,
    indexes,
    migrationRows: Number(migrationRows.rows[0]?.count ?? 0),
    extensions: extensionRows.rows.map((row) => row.extname),
  };
}

async function assertRuntimeClient(dataDir: string) {
  process.env.AGENTHUB_DB_DRIVER = "pglite";
  process.env.AGENTHUB_PGLITE_DATA_DIR = dataDir;

  const runtime = await import("../src/server/db/index");
  if (runtime.dbDriver !== "pglite") {
    throw new Error(`Expected runtime PGlite driver, received ${runtime.dbDriver}`);
  }

  const runtimeClient = runtime.client as unknown as RuntimePgliteClient;
  const userCount = await runtimeClient.query<{ count: string }>("SELECT count(*)::text AS count FROM users");
  const vectorProbe = await runtimeClient.query<{ distance: string }>(
    "SELECT ('[1,2,3]'::vector <=> '[1,2,4]'::vector)::text AS distance",
  );

  await runtimeClient.close?.();

  return {
    driver: runtime.dbDriver,
    users: Number(userCount.rows[0]?.count ?? 0),
    vectorDistance: vectorProbe.rows[0]?.distance,
  };
}

async function main() {
  const appRoot = process.cwd();
  const { dataDir, cleanup } = await resolveDataDir();
  const client = new PGlite(dataDir, { extensions: { vector, pg_trgm } });

  try {
    await installRequiredExtensions(client);
    await ensureMigrationJournal(client);
    const migrations = await applyJournalMigrations(client, appRoot);
    const schema = await assertSchema(client);
    await client.close();
    const runtime = await assertRuntimeClient(dataDir);

    console.log(
      JSON.stringify(
        {
          status: "ok",
          dataDir,
          cleanup,
          migrations,
          schema,
          runtime,
        },
        null,
        2,
      ),
    );
  } finally {
    if (!client.closed) {
      await client.close();
    }
    if (cleanup) {
      await rm(dataDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
