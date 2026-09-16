# syntax=docker/dockerfile:1
#
# Build context is the repository root (see docker-compose.yml) because this is
# an npm workspace: the API depends on packages/shared and on the root
# package-lock.json.

FROM node:22-slim AS base
# git: the ingest pipeline shallow-clones repositories.
# ca-certificates: HTTPS clones and the Anthropic API.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --workspace restricts what actually gets installed to @app/api and
# @app/shared - apps/web/package.json above is only there to satisfy npm's
# workspace resolution against the lockfile, not to pull in Next.js/React.
# Without this, `npm prune --omit=dev` later doesn't help: web's next/react/
# etc. are regular dependencies, not devDependencies, so they'd ship in this
# image unused (this alone was ~1.5GB of dead weight in the API image).
# The cache mount keeps downloaded/extracted packages across builds instead
# of re-fetching and re-writing a fresh multi-GB layer on every rebuild.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace=@app/api --workspace=@app/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@app/shared \
 && npm run db:generate --workspace=@app/api \
 && npm run build --workspace=@app/api

# Trim devDependencies out of the image we actually ship.
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app /app
RUN mkdir -p /data/models /data/repos \
 && chown -R node:node /data /app
# Repository contents are untrusted input; nothing here needs root.
USER node
EXPOSE 3001
# The startup/migration logic (equivalent to apps/api/docker-entrypoint.sh,
# kept in the repo as the readable canonical copy - update both if you
# change this) is inlined directly into ENTRYPOINT rather than COPY'd in as
# a separate script file and exec'd. Docker Desktop - notably with the
# containerd image store on Apple Silicon - has a known bug where a COPY'd
# file's permission bits can come back corrupted at container start once a
# later RUN step touches them (e.g. `chmod +x`), surfacing as "Permission
# denied" even trying to just open the file, regardless of the mode the
# build set. Baking the command into the image config instead of a
# filesystem layer sidesteps that whole class of bug: there is no separate
# file for it to corrupt.
ENTRYPOINT ["/bin/sh", "-c", "set -e; echo '[entrypoint] applying database migrations...'; (cd apps/api && npx prisma migrate deploy); echo '[entrypoint] starting api'; exec node apps/api/dist/main.js"]
