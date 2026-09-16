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
RUN npm ci

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
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data/models /data/repos \
 && chown -R node:node /data /app
# Repository contents are untrusted input; nothing here needs root.
USER node
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
