export function isSentryConfigured() {
  return Boolean(process.env.SENTRY_DSN) && process.env.SENTRY_ENABLED !== "0";
}
