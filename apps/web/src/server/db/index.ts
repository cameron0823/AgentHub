import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DatabaseDriver = "postgres" | "pglite";

export function resolveDatabaseDriver(env: NodeJS.ProcessEnv = process.env): DatabaseDriver {
  const value = (env.AGENTHUB_DB_DRIVER || env.DATABASE_DRIVER || "postgres").toLowerCase();
  if (value === "pglite" || value === "postgres") return value;
  throw new Error(`Unsupported AGENTHUB_DB_DRIVER: ${value}`);
}

function createPostgresDatabase() {
  const connectionString = process.env.DATABASE_URL || "postgres://agenthub:agenthub_password@localhost:5432/agenthub";
  const postgresClient = postgres(connectionString, { max: 10 });
  return {
    driver: "postgres" as const,
    client: postgresClient,
    db: drizzle(postgresClient, { schema }),
  };
}

function createPgliteDatabase() {
  const dataDir = process.env.AGENTHUB_PGLITE_DATA_DIR || process.env.PGLITE_DATA_DIR || "./data/pglite";
  const pgliteClient = new PGlite(dataDir, { extensions: { vector, pg_trgm } });
  return {
    driver: "pglite" as const,
    client: pgliteClient,
    db: drizzlePglite(pgliteClient, { schema }),
  };
}

const database = resolveDatabaseDriver() === "pglite" ? createPgliteDatabase() : createPostgresDatabase();
type PostgresDatabase = ReturnType<typeof createPostgresDatabase>;

export const dbDriver = database.driver;
export const client = database.client as PostgresDatabase["client"];
export const db = database.db as PostgresDatabase["db"];

export type DB = typeof db;
