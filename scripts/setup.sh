#!/usr/bin/env bash
# One-command setup: `npm run setup -- ollama` or `npm run setup -- anthropic`.
#
# - ollama: brings up the whole stack including a bundled Ollama container,
#   and pulls qwen2.5-coder:7b into it. No API key, nothing installed on the
#   host beyond Docker. First run downloads the model (~4.7GB) on top of the
#   usual image builds, so it's slower than the anthropic path, and
#   inference runs CPU-only inside Docker Desktop's VM (see docker-compose.yml
#   comments) - noticeably slower per answer than a native Ollama install.
# - anthropic: prompts for an API key (only if .env doesn't already have
#   one) and brings up the stack without the local-llm profile.
#
# Either way this is the only command needed on a fresh clone - no separate
# `cp .env.example .env` step, no manually editing .env.
set -euo pipefail

PROVIDER="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/env-file.sh
source "$SCRIPT_DIR/lib/env-file.sh"

if [[ "$PROVIDER" != "ollama" && "$PROVIDER" != "anthropic" ]]; then
  echo "Usage: npm run setup -- ollama|anthropic" >&2
  echo "  ollama     - fully local, no API key, bundled Ollama container" >&2
  echo "  anthropic  - hosted Claude, needs an API key" >&2
  exit 1
fi

ensure_env_file "$ROOT_DIR"
configure_provider "$ROOT_DIR" "$PROVIDER"

echo
echo "Provider: $PROVIDER"
echo "Building and starting the stack (this can take a while on first run)..."
echo

cd "$ROOT_DIR"
if [[ "$PROVIDER" == "ollama" ]]; then
  docker compose --profile local-llm up --build -d
else
  docker compose up --build -d
fi

echo
echo "Done."
echo "  Web UI: http://localhost:3000"
echo "  API:    http://localhost:3001/health"
if [[ "$PROVIDER" == "ollama" ]]; then
  echo
  echo "The model is downloading in the background if this is the first run -"
  echo "check progress with: docker compose logs -f ollama-pull"
fi
