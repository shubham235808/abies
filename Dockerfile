FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM builder AS migrator
# Runs from the builder stage (it already has the full node_modules with the
# prisma CLI, unlike the runner stage below which only ships @prisma/client)
# — docker-compose.prod.yml's one-shot `migrate` service uses this stage
# so `prisma migrate deploy` runs safely on every deploy instead of relying
# on someone remembering to run it by hand against a prod database.
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
# Docker sets HOSTNAME to the container ID by default, and Next's standalone
# server binds to $HOSTNAME when set — silently listening on the container's
# internal IP instead of all interfaces. Override it explicitly.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
