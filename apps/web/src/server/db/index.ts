import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgres://agenthub:agenthub_password@localhost:5432/agenthub";

// For migrations and queries
export const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });

export type DB = typeof db;
