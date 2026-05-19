import { isSentryConfigured } from "./sentry-config";

let sentryInitialized = false;

export async function initializeSentry() {
  if (sentryInitialized || !isSentryConfigured()) {
    return sentryInitialized;
  }

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.AGENTHUB_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    enabled: true,
  });

  sentryInitialized = true;
  return true;
}

export { isSentryConfigured };
