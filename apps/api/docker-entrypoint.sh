#!/bin/sh
set -e

# Applying migrations at container start keeps "docker compose up" to a single
# command. For a real deployment this belongs in a separate migration job so
# that N replicas do not race - noted in the README.
echo "[entrypoint] applying database migrations..."
cd /app/apps/api && npx prisma migrate deploy
cd /app

echo "[entrypoint] starting api"
exec "$@"
