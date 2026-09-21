#!/usr/bin/env bash
# Swap which LLM provider a running stack uses, without a full rebuild:
# `npm run llm:switch -- ollama` or `npm run llm:switch -- anthropic`.
#
# Unlike setup.sh this expects .env to already exist (from a prior setup.sh
# run) and only recreates the services that actually need to change - the
# api container to pick up the new .env, plus ollama/ollama-pull the first
# time you switch to ollama.
set -euo pipefail

PROVIDER="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/env-file.sh
source "$SCRIPT_DIR/lib/env-file.sh"
# shellcheck source=lib/wait-for-api.sh
source "$SCRIPT_DIR/lib/wait-for-api.sh"

if [[ "$PROVIDER" != "ollama" && "$PROVIDER" != "anthropic" ]]; then
  echo "Usage: npm run llm:switch -- ollama|anthropic" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found - run 'npm run setup -- $PROVIDER' first." >&2
  exit 1
fi

configure_provider "$ROOT_DIR" "$PROVIDER"

cd "$ROOT_DIR"
if [[ "$PROVIDER" == "ollama" ]]; then
  echo "Starting ollama (if not already running) and recreating api..."
  # ollama/ollama-pull are NOT force-recreated: `up -d` starts them only if
  # they aren't already running, so an already-healthy ollama container
  # (and an already-pulled model) is left alone rather than restarted.
  # ollama pull is itself idempotent - a second run just verifies the model
  # is present instead of re-downloading it.
  docker compose --profile local-llm up -d ollama ollama-pull
  docker compose up -d --force-recreate api
  echo
  echo "If the model isn't already pulled this may take a while - check with:"
  echo "  docker compose logs -f ollama-pull"
else
  echo "Recreating api..."
  docker compose up -d --force-recreate api
fi

echo
wait_for_api
echo "Switched to $PROVIDER."
