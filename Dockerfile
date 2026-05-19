FROM node:22-bookworm-slim AS base

ENV NO_UPDATE_NOTIFIER=1
ENV PNPM_CONFIG_UPDATE_NOTIFIER=false
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1
ENV HUSKY=0

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm config set update-notifier false

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/agent-runtime/package.json ./packages/agent-runtime/package.json
COPY packages/ai-providers/package.json ./packages/ai-providers/package.json
COPY packages/editor-kernel/package.json ./packages/editor-kernel/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN pnpm install --frozen-lockfile --config.auto-install-peers=false --loglevel=error

FROM base AS builder
WORKDIR /app
COPY . .

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/agent-runtime/node_modules ./packages/agent-runtime/node_modules
COPY --from=deps /app/packages/ai-providers/node_modules ./packages/ai-providers/node_modules
COPY --from=deps /app/packages/editor-kernel/node_modules ./packages/editor-kernel/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/eslint-config/node_modules ./packages/eslint-config/node_modules

RUN AGENTHUB_DISABLE_BACKGROUND_WORKERS=1 pnpm -C apps/web build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
