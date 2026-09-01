# Multi-stage Dockerfile for TheVisualizer Platform
# Produces an optimized, secure production container for Google Cloud Run

# Stage 1: Base & Dependencies
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9.15.4

# Stage 2: Dependencies Cache
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/simulation/package.json ./packages/simulation/
COPY packages/ui/package.json ./packages/ui/
COPY packages/logging/package.json ./packages/logging/
COPY packages/config/package.json ./packages/config/
COPY packages/test-utils/package.json ./packages/test-utils/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/ws-gateway/package.json ./apps/ws-gateway/

RUN pnpm install --frozen-lockfile

# Stage 3: Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=true

RUN mkdir -p /app/apps/web/public
RUN pnpm build

# Stage 4: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "apps/web/server.js"]
