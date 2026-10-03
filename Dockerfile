# EXPANSION-5 — one parameterized Dockerfile for all four deployables
# (apps/client-web, apps/partner-web, apps/management-web, apps/platform-api),
# built via `docker build --build-arg APP_NAME=<app> .`. Each app's own
# next.config.mjs sets output: 'standalone', so the trace/copy mechanics
# below are identical regardless of which app is selected.
FROM node:22-alpine AS base
WORKDIR /app
# node:22-alpine ships corepack with pnpm already shimmed; corepack
# downloads the exact version package.json's "packageManager" field pins
# (pnpm@12.8.1) the first time it's actually invoked below — no separate
# `npm install -g pnpm` needed (and that conflicts: it tries to recreate
# the same /usr/local/bin/pnpx file corepack enable already created).
RUN corepack enable

# ---- deps: install once, cached unless a package.json changes ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/client-web/package.json apps/client-web/package.json
COPY apps/partner-web/package.json apps/partner-web/package.json
COPY apps/management-web/package.json apps/management-web/package.json
COPY apps/platform-api/package.json apps/platform-api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/design-system/package.json packages/design-system/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- builder: full source, generate the Prisma client, build one app ----
FROM base AS builder
ARG APP_NAME
COPY --from=deps /app /app
COPY . .
# Neither `prisma generate` (reads schema.prisma only) nor `next build`'s
# route-handler page-data collection (every route is dynamic — "no DB to
# query at build time", see each public page's own comment — so nothing
# here actually opens a connection) needs real credentials, but importing
# lib/db.ts eagerly validates the FULL env schema via getEnv(), so every
# var with no zod .default()/.optional() still has to be *present*.
# .dockerignore deliberately excludes the real .env from ever reaching the
# build context (it used to get baked into this layer's history before
# .dockerignore existed — real secrets, in image layers, for no actual
# build-time need) — these placeholders satisfy validation without it. The
# real values are supplied at container start via docker-compose's env_file.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    REDIS_URL="redis://localhost:6379" \
    STORAGE_ENDPOINT="http://localhost:9000" \
    STORAGE_ACCESS_KEY_ID="build" \
    STORAGE_SECRET_ACCESS_KEY="build" \
    STORAGE_BUCKET="build" \
    SESSION_SECRET="build-time-placeholder-not-a-real-secret-00" \
    OTP_PEPPER="build-time-placeholder-not-a-real-secret-00" \
    APP_BASE_URL="http://localhost:3000"
RUN pnpm --filter @abies/domain run prisma:generate
RUN pnpm --filter ${APP_NAME} run build

# ---- migrator: docker-compose.prod.yml's one-shot `migrate` service runs
# `prisma migrate deploy` from here on every deploy, same as before the
# monorepo split — this stage still has the full workspace + prisma CLI.
FROM builder AS migrator
CMD ["pnpm", "--filter", "@abies/domain", "run", "prisma:deploy"]

# ---- runner: only the traced standalone output for the selected app ----
FROM base AS runner
ARG APP_NAME
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next's standalone trace mirrors the monorepo path (e.g.
# .next/standalone/apps/client-web/server.js) AND its hoisted
# node_modules/* symlinks are RELATIVE, calibrated to that exact nesting
# depth (e.g. ../../../node_modules/.pnpm/...) — flattening server.js to
# ./server.js while copying node_modules separately breaks every one of
# those symlinks (they'd resolve outside /app entirely). Copying the whole
# standalone/ tree as-is, nesting intact, is the only layout where the
# traced symlinks still resolve correctly.
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=builder /app/apps/${APP_NAME}/public ./apps/${APP_NAME}/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
# Docker sets HOSTNAME to the container ID by default, and Next's standalone
# server binds to $HOSTNAME when set — silently listening on the container's
# internal IP instead of all interfaces. Override it explicitly.
ENV HOSTNAME=0.0.0.0
# server.js lives at apps/<app>/server.js in this preserved-nesting layout
# (see the COPY comment above) — ENV + shell-form CMD so $APP_NAME actually
# expands (exec-form CMD can't do shell substitution).
ENV APP_NAME=${APP_NAME}
CMD node apps/$APP_NAME/server.js
