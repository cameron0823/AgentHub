#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const includeLocalEnv = process.argv.includes("--include-local");
const envFiles = includeLocalEnv
  ? [".env.example", ".env", ".env.local", "apps/web/.env", "apps/web/.env.local"]
  : [".env.example"];
const strictSecrets = process.argv.includes("--strict-secrets");

const requiredKeys = [
  "DATABASE_URL",
  "AGENTHUB_DB_DRIVER",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "AUTH_CASDOOR_ISSUER",
  "AUTH_CASDOOR_ID",
  "AUTH_CASDOOR_SECRET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "SEARXNG_BASE_URL",
  "OLLAMA_URL",
  "LMSTUDIO_URL",
  "VLLM_URL",
  "TRUST_ENGINE_SECRET",
  "LOG_LEVEL",
  "SENTRY_ENABLED",
  "SENTRY_TRACES_SAMPLE_RATE",
];

const url = z.string().url();
const optionalUrl = z.union([z.literal(""), url]);
const nonEmpty = z.string().min(1);
const optionalString = z.string();
const port = z.coerce.number().int().min(1).max(65535);
const boolFlag = z.enum(["0", "1", "true", "false"]);

const envSchema = z
  .object({
    DATABASE_URL: nonEmpty,
    AGENTHUB_DB_DRIVER: z.enum(["postgres", "pglite"]),
    AGENTHUB_PGLITE_DATA_DIR: optionalString.optional(),
    POSTGRES_DB: optionalString.optional(),
    POSTGRES_USER: optionalString.optional(),
    POSTGRES_PASSWORD: optionalString.optional(),
    NEXTAUTH_URL: url,
    NEXTAUTH_SECRET: nonEmpty,
    AUTH_CASDOOR_ISSUER: url,
    AUTH_CASDOOR_ID: nonEmpty,
    AUTH_CASDOOR_SECRET: nonEmpty,
    S3_ENDPOINT: url,
    S3_REGION: nonEmpty,
    S3_BUCKET: nonEmpty,
    S3_ACCESS_KEY_ID: nonEmpty,
    S3_SECRET_ACCESS_KEY: nonEmpty,
    REDIS_URL: url,
    REDIS_HOST: nonEmpty,
    REDIS_PORT: port,
    UPSTASH_REDIS_REST_URL: optionalUrl.optional(),
    UPSTASH_REDIS_REST_TOKEN: optionalString.optional(),
    RATE_LIMIT_REDIS_PREFIX: optionalString.optional(),
    SEARXNG_BASE_URL: url,
    OLLAMA_URL: url,
    LMSTUDIO_URL: url,
    VLLM_URL: url,
    GITHUB_COPILOT_CLIENT_ID: optionalString.optional(),
    GOOGLE_CLIENT_ID: optionalString.optional(),
    GOOGLE_CLIENT_SECRET: optionalString.optional(),
    TRUST_ENGINE_SECRET: optionalString.optional(),
    AGENTHUB_SANDBOX_IMAGE: optionalString.optional(),
    AGENTHUB_SANDBOX_SECCOMP_PROFILE: optionalString.optional(),
    AGENTHUB_SANDBOX_APPARMOR_PROFILE: optionalString.optional(),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
    SENTRY_ENABLED: boolFlag,
    SENTRY_DSN: optionalUrl.optional(),
    SENTRY_ENVIRONMENT: optionalString.optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  })
  .passthrough()
  .superRefine((env, ctx) => {
    if (env.UPSTASH_REDIS_REST_URL && !env.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["UPSTASH_REDIS_REST_TOKEN"],
        message: "UPSTASH_REDIS_REST_TOKEN is required when UPSTASH_REDIS_REST_URL is set.",
      });
    }

    if (strictSecrets && (!env.TRUST_ENGINE_SECRET || env.TRUST_ENGINE_SECRET.length < 32)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_ENGINE_SECRET"],
        message: "TRUST_ENGINE_SECRET must be set to at least 32 characters when --strict-secrets is used.",
      });
    }
  });

function parseEnvFile(filePath) {
  const result = {};
  const content = readFileSync(filePath, "utf8");

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      throw new Error(`${filePath}:${index + 1} is not a KEY=value line`);
    }

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }

  return result;
}

function formatZodIssue(issue) {
  const key = issue.path.length > 0 ? issue.path.join(".") : "env";
  return `${key}: ${issue.message}`;
}

let failures = 0;

for (const file of envFiles) {
  const absolutePath = path.resolve(file);
  if (!existsSync(absolutePath)) continue;

  try {
    const env = parseEnvFile(absolutePath);
    const missing = file === ".env.example" ? requiredKeys.filter((key) => !(key in env)) : [];
    if (missing.length > 0) {
      failures += 1;
      console.error(`${file}: missing required documented keys: ${missing.join(", ")}`);
      continue;
    }

    const parsed = envSchema.safeParse(env);
    if (!parsed.success) {
      failures += 1;
      console.error(`${file}: invalid environment values`);
      for (const issue of parsed.error.issues) {
        console.error(`  - ${formatZodIssue(issue)}`);
      }
      continue;
    }

    console.log(`${file}: ok`);
  } catch (error) {
    failures += 1;
    console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
