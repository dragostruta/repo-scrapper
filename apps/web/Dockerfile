# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app

FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --workspace restricts what actually gets installed to @app/web and
# @app/shared - apps/api/package.json above is only there to satisfy npm's
# workspace resolution against the lockfile, not to install NestJS/Prisma.
# The cache mount keeps downloaded/extracted packages across builds instead
# of re-fetching and re-writing a fresh multi-GB layer on every rebuild.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace=@app/web --workspace=@app/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace=@app/shared \
 && npm run build --workspace=@app/web

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
