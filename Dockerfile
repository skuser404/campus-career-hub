# ─────────────────────────────────────────────────────────────────────────
# Campus Career Hub — API image
#
# Multi-stage. The final image contains the compiled JS, production
# dependencies, and nothing else: no TypeScript, no source, no dev tooling, no
# test fixtures. A smaller image is not the point — a smaller attack surface is.
# ─────────────────────────────────────────────────────────────────────────

# ── Stage 1: install every dependency, including dev ─────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only the manifests first. Docker caches this layer on their checksum, so
# a code change does not re-run a five-minute npm install.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspace @cch/shared --workspace @cch/api --include-workspace-root


# ── Stage 2: compile ─────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY tsconfig.base.json package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# The shared package must build first — the API imports its compiled output.
RUN npm run build --workspace @cch/shared \
 && npm run build --workspace @cch/api


# ── Stage 3: production dependencies only ────────────────────────────────
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN npm ci --omit=dev --workspace @cch/shared --workspace @cch/api --include-workspace-root \
 && npm cache clean --force


# ── Stage 4: the runtime image ───────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# `dumb-init` as PID 1. Node does not reap zombie processes and does not forward
# signals to children, so without an init process a SIGTERM from the orchestrator
# never reaches the graceful-shutdown handler and in-flight requests are killed.
RUN apk add --no-cache dumb-init

# A non-root user. If the process is ever compromised, it lands as `nodejs` with
# no write access to its own code rather than as root.
RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nodejs -G nodejs

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules

COPY --from=build --chown=nodejs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nodejs:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/

# The migrations are DATA, not code — they are read at runtime by `db:migrate`,
# so they must ship in the image rather than being left behind in the build stage.
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist/db/migrations ./apps/api/dist/db/migrations

USER nodejs

EXPOSE 4000

# Reports the DATABASE's health, not merely "the process is alive". An API that
# cannot reach Postgres is useless, and the orchestrator should know to pull it
# out of rotation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/index.js"]
