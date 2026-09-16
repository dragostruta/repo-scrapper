#!/bin/sh
set -e

# Applying migrations at container start keeps "docker compose up" to a single
# command. For a real deployment this belongs in a separate migration job so
# that N replicas do not race - noted in the README.
#
# NOTE: this file is not actually copied into the api image - see the
# ENTRYPOINT comment in apps/api/Dockerfile for why. It is kept here as the
# readable, canonical version of that logic, and for running migrations by
# hand outside Docker. Keep the two in sync if you change either.
echo "[entrypoint] applying database migrations..."
cd /app/apps/api && npx prisma migrate deploy
cd /app

echo "[entrypoint] starting api"
exec "$@"
