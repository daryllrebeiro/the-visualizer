FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node packages/config/package.json ./packages/config/
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node packages/logging/package.json ./packages/logging/
COPY --chown=node:node packages/simulation/package.json ./packages/simulation/
COPY --chown=node:node apps/ws-gateway/package.json ./apps/ws-gateway/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --chown=node:node packages/config/dist ./packages/config/dist
COPY --chown=node:node packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node packages/logging/dist ./packages/logging/dist
COPY --chown=node:node packages/simulation/dist ./packages/simulation/dist
COPY --chown=node:node apps/ws-gateway/dist ./apps/ws-gateway/dist

USER node

EXPOSE 3001
CMD ["node", "apps/ws-gateway/dist/index.js"]
