#!/usr/bin/env bash
# Blocks until the API answers its health check, so "Done." means the app is
# actually usable. `docker compose up -d` returns as soon as containers start,
# while the API is still applying migrations and loading the embedding model;
# opening the UI in that window shows a page whose requests fail.

wait_for_api() {
  local url="${API_HEALTH_URL:-http://localhost:3001/health}"
  local timeout_seconds="${API_WAIT_TIMEOUT_SECONDS:-300}"
  local deadline=$((SECONDS + timeout_seconds))

  printf 'Waiting for the API to become healthy'
  until curl -fsS "$url" >/dev/null 2>&1; do
    if ((SECONDS >= deadline)); then
      echo
      echo "The API did not become healthy within ${timeout_seconds}s." >&2
      echo "See what it is doing with: docker compose logs api" >&2
      return 1
    fi
    printf '.'
    sleep 3
  done
  echo ' ready.'
}
