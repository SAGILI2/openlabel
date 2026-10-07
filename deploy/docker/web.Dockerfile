# syntax=docker/dockerfile:1.7
# Multi-stage build for the OpenLabel web app and the migration job.

ARG NODE_VERSION=24-alpine

# ---- base: pnpm via corepack
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# ---- deps: install with only manifests copied, so this layer caches well
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build: compile packages and the Next.js standalone server
FROM deps AS build
COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @openlabel/contracts build \
 && pnpm --filter @openlabel/db build \
 && pnpm --filter @openlabel/web build

# ---- migrate: runs pending migrations and exits
FROM node:${NODE_VERSION} AS migrate
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/packages/db/drizzle ./packages/db/drizzle
COPY --from=build /repo/packages/db/package.json ./packages/db/package.json
USER node
CMD ["node", "packages/db/dist/migrate/cli.js"]

# ---- runtime: minimal standalone server, non-root
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
