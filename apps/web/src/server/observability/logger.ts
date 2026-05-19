import pino from "pino";
export { getTraceId, REQUEST_ID_HEADER, TRACE_ID_HEADER } from "./trace";

const redactPaths = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "TRUST_ENGINE_SECRET",
  "S3_SECRET_ACCESS_KEY",
  "AUTH_CASDOOR_SECRET",
];

export const logger = pino({
  name: "agenthub",
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    app: "agenthub",
    runtime: "nodejs",
  },
  redact: {
    paths: redactPaths,
    censor: "[redacted]",
  },
});
