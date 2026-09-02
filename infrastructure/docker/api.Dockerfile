FROM node:20-alpine@sha256:4b4a1b02b5e28a5ff6b3d11b2ebbe319808a3d4204d0ef95759367d3238680ad AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /usr/src/app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @the-visualizer/api build

FROM node:20-alpine@sha256:4b4a1b02b5e28a5ff6b3d11b2ebbe319808a3d4204d0ef95759367d3238680ad AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/config/package.json ./packages/config/
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node packages/logging/package.json ./packages/logging/
COPY --chown=node:node apps/api/package.json ./apps/api/
RUN pnpm install --prod --frozen-lockfile

COPY --chown=node:node --from=builder /usr/src/app/packages/config/dist ./packages/config/dist
COPY --chown=node:node --from=builder /usr/src/app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /usr/src/app/packages/logging/dist ./packages/logging/dist
COPY --chown=node:node --from=builder /usr/src/app/apps/api/dist ./apps/api/dist

USER node

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
