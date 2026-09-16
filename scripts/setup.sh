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

# Every `--build` leaves the previous image's layers behind as a dangling
# (untagged) image once the tag moves to the new build - they're pure dead
# weight (docker keeps them because a container could theoretically still
# reference one, but nothing here ever does). Left alone across enough
# `setup`/`llm:switch` runs, these silently accumulate into gigabytes and can
# fill Docker Desktop's disk allocation, which is what took the `db`
# container down with a "No space left on device" panic in the past. This is
# best-effort and never fails setup - if pruning fails (or `docker` needs a
# permission prompt to run non-interactively) it's a no-op, not a blocker.
docker image prune -f >/dev/null 2>&1 || true

echo
echo "Done."
echo "  Web UI: http://localhost:3000"
echo "  API:    http://localhost:3001/health"
if [[ "$PROVIDER" == "ollama" ]]; then
  echo
  echo "The model is downloading in the background if this is the first run -"
  echo "check progress with: docker compose logs -f ollama-pull"
fi

# The MCP server runs on the host (Claude Code spawns it), so it's built here
# rather than in Docker. Best effort: the web app works without it.
echo
if [[ -d "$ROOT_DIR/node_modules" ]] && npm run --silent mcp:build >/dev/null 2>&1; then
  echo "MCP server built. Open Claude Code in this folder and approve the"
  echo "\"repo-scrapper\" server from .mcp.json - see README > Using it from Claude Code."
else
  echo "Skipped building the MCP server (run \`npm install\` then \`npm run mcp:build\`)."
fi
