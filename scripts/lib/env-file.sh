#!/usr/bin/env bash
# Shared helpers for scripts/setup.sh and scripts/switch-llm.sh. Sourced, not
# executed directly.

# set_env_var FILE KEY VALUE - idempotent: replaces an existing "KEY=..."
# line in place, or appends one if the key isn't there yet. Value is used
# as-is (no quoting/escaping beyond what the caller passes), matching how
# the rest of this project's .env files are written.
set_env_var() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$file"; then
    # A temp file + mv, rather than `sed -i`, so this behaves the same on
    # macOS/BSD sed and GNU/Linux sed (their -i flags aren't compatible).
    awk -F= -v k="$key" -v v="$value" \
      'BEGIN{OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

# get_env_var FILE KEY - prints the current value, or nothing if unset.
get_env_var() {
  local file="$1" key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
}

# ensure_env_file ROOT_DIR - copies .env.example to .env on first run.
ensure_env_file() {
  local root_dir="$1"
  if [[ ! -f "$root_dir/.env" ]]; then
    cp "$root_dir/.env.example" "$root_dir/.env"
    echo "Created .env from .env.example"
  fi
}

# configure_provider ROOT_DIR PROVIDER - writes the env vars for the chosen
# provider into .env. For anthropic, prompts for an API key only if one
# isn't already set (never overwrites a key that's already there).
configure_provider() {
  local root_dir="$1" provider="$2" env_file="$root_dir/.env"

  case "$provider" in
    ollama)
      set_env_var "$env_file" LLM_PROVIDER ollama
      # Points at the bundled `ollama` compose service, not a host install -
      # see the OLLAMA_BASE_URL comment in .env.example for the other cases.
      set_env_var "$env_file" OLLAMA_BASE_URL 'http://ollama:11434'
      set_env_var "$env_file" OLLAMA_MODEL 'qwen2.5-coder:7b'
      ;;
    anthropic)
      set_env_var "$env_file" LLM_PROVIDER anthropic
      local current_key
      current_key="$(get_env_var "$env_file" ANTHROPIC_API_KEY)"
      if [[ -z "$current_key" ]]; then
        read -rsp "Enter your Anthropic API key (from https://console.anthropic.com/): " key
        echo
        set_env_var "$env_file" ANTHROPIC_API_KEY "$key"
      fi
      ;;
    *)
      echo "Unknown provider '$provider' - expected 'ollama' or 'anthropic'." >&2
      return 1
      ;;
  esac
}
