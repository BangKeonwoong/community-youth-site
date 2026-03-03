#!/usr/bin/env bash
set -euo pipefail

is_capacity_error_file() {
  local file_path="$1"
  grep -Eqi \
    'MODEL_CAPACITY_EXHAUSTED|No capacity available for model|RESOURCE_EXHAUSTED|Too Many Requests|"code":[[:space:]]*429|status 429' \
    "$file_path"
}

DEFAULT_MODELS=("gemini-3-flash-preview" "gemini-3.1-pro-preview" "gemini-3-pro-preview")
probe_timeout_seconds="${GEMINI_PROBE_TIMEOUT_SECONDS:-20}"
probe_prompt="${GEMINI_PROBE_PROMPT:-Return exactly: PROBE_OK}"
declare -a models=("${DEFAULT_MODELS[@]}")

if [[ $# -gt 0 ]]; then
  models=("$@")
fi

if ! [[ "$probe_timeout_seconds" =~ ^[0-9]+$ ]] || (( probe_timeout_seconds <= 0 )); then
  echo "GEMINI_PROBE_TIMEOUT_SECONDS must be a positive integer." >&2
  exit 1
fi

printf 'Gemini probe timeout: %ss\n' "$probe_timeout_seconds"
printf '%-28s %-14s %s\n' "MODEL" "STATUS" "DETAIL"

for model in "${models[@]}"; do
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  combined_file="$(mktemp)"

  if command -v timeout >/dev/null 2>&1; then
    if timeout "${probe_timeout_seconds}s" \
      gemini --model "$model" --prompt "$probe_prompt" >"$stdout_file" 2>"$stderr_file"; then
      status=0
    else
      status="$?"
    fi
  else
    if gemini --model "$model" --prompt "$probe_prompt" >"$stdout_file" 2>"$stderr_file"; then
      status=0
    else
      status="$?"
    fi
  fi

  cat "$stdout_file" "$stderr_file" >"$combined_file"

  if (( status == 0 )) && grep -Fq "PROBE_OK" "$stdout_file"; then
    printf '%-28s %-14s %s\n' "$model" "SUCCESS" "response ok"
  elif (( status == 124 )); then
    printf '%-28s %-14s %s\n' "$model" "TIMEOUT" "probe timed out"
  elif is_capacity_error_file "$combined_file"; then
    printf '%-28s %-14s %s\n' "$model" "CAPACITY" "429/resource exhausted"
  elif grep -Eq 'ModelNotFoundError|Requested entity was not found|code: 404' "$combined_file"; then
    printf '%-28s %-14s %s\n' "$model" "NOT_FOUND" "model id unavailable"
  else
    printf '%-28s %-14s %s\n' "$model" "ERROR" "non-capacity failure"
  fi

  rm -f "$stdout_file" "$stderr_file" "$combined_file"
done
