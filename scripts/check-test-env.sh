#!/usr/bin/env bash
# Turns the confusing failure a fresh clone hits - tests dying somewhere inside
# Prisma because DATABASE_URL is undefined - into one line that says what to do.
#
# Passes when the variables are already exported (how CI runs) or when a .env
# exists for dotenv-cli to load (how a developer runs). Only the case where
# neither is true is an error, because that case cannot work.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$repo_root/.env" ] || [ -n "${DATABASE_URL:-}" ]; then
  exit 0
fi

cat >&2 <<'MESSAGE'

  No .env file and no DATABASE_URL in the environment.

  The unit tests do not need a database, but the end-to-end ones do, and the
  test scripts load their configuration from .env at the repository root.

  Pick one:

    npm run setup -- ollama     # fully local: writes .env, starts Postgres
    npm run setup -- anthropic  # same, but answers come from the Anthropic API
    cp .env.example .env        # if you would rather fill it in yourself

MESSAGE
exit 1
