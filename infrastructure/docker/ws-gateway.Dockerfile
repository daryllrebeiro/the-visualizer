FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /usr/src/app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @the-visualizer/ws-gateway build

FROM base AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/logging/package.json ./packages/logging/
COPY packages/simulation/package.json ./packages/simulation/
COPY apps/ws-gateway/package.json ./apps/ws-gateway/
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/packages/config/dist ./packages/config/dist
COPY --from=builder /usr/src/app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /usr/src/app/packages/logging/dist ./packages/logging/dist
COPY --from=builder /usr/src/app/packages/simulation/dist ./packages/simulation/dist
COPY --from=builder /usr/src/app/apps/ws-gateway/dist ./apps/ws-gateway/dist

EXPOSE 3001
CMD ["node", "apps/ws-gateway/dist/index.js"]
