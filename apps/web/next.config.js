const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@agenthub/ui", "@agenthub/editor-kernel"],
  serverExternalPackages: ["postgres", "bullmq", "node-cron", "@sentry/nextjs", "@sentry/node"],
  async rewrites() {
    return [];
  },
};

module.exports = withNextIntl(nextConfig);
