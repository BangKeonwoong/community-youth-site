#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: gemini-run.sh [options] [-- <extra gemini args>]

Options:
  -p, --prompt TEXT              Prompt for non-interactive mode.
      --max-wait-seconds N       Total retry budget in seconds (default: 900).
      --call-timeout-seconds N   Timeout per gemini call in seconds (default: 120).
      --model MODEL              Override model order (repeatable).
  -h, --help                     Show this help.

Environment:
  GEMINI_MAX_WAIT_SECONDS        Overrides --max-wait-seconds default.
  GEMINI_CALL_TIMEOUT_SECONDS    Overrides --call-timeout-seconds default.
  GEMINI_MODELS                  Comma-separated model order override.

Default model order:
  1) gemini-3-flash-preview
  2) gemini-3.1-pro-preview
  3) gemini-3-pro-preview

Exit codes:
  0   success
  42  capacity retry budget exhausted
  1   other failures
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

is_positive_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( "$1" > 0 ))
}

is_capacity_error_file() {
  local file_path="$1"
  grep -Eqi \
    'MODEL_CAPACITY_EXHAUSTED|No capacity available for model|RESOURCE_EXHAUSTED|Too Many Requests|"code":[[:space:]]*429|status 429' \
    "$file_path"
}

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "${call_timeout_seconds}s" "$@"
  else
    "$@"
  fi
}

DEFAULT_MODELS=("gemini-3-flash-preview" "gemini-3.1-pro-preview" "gemini-3-pro-preview")
BACKOFF_SECONDS=(2 4 8 12)

prompt=""
max_wait_seconds="${GEMINI_MAX_WAIT_SECONDS:-900}"
call_timeout_seconds="${GEMINI_CALL_TIMEOUT_SECONDS:-120}"
declare -a model_overrides=()
declare -a passthrough_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prompt)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
      prompt="$2"
      shift 2
      ;;
    --max-wait-seconds)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
      max_wait_seconds="$2"
      shift 2
      ;;
    --call-timeout-seconds)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
      call_timeout_seconds="$2"
      shift 2
      ;;
    --model)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
      model_overrides+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      passthrough_args+=("$@")
      break
      ;;
    *)
      passthrough_args+=("$1")
      shift
      ;;
  esac
done

is_positive_integer "$max_wait_seconds" || {
  echo "max-wait-seconds must be a positive integer." >&2
  exit 1
}
is_positive_integer "$call_timeout_seconds" || {
  echo "call-timeout-seconds must be a positive integer." >&2
  exit 1
}

declare -a models=()
if [[ ${#model_overrides[@]} -gt 0 ]]; then
  models=("${model_overrides[@]}")
elif [[ -n "${GEMINI_MODELS:-}" ]]; then
  IFS=',' read -r -a models <<<"${GEMINI_MODELS}"
else
  models=("${DEFAULT_MODELS[@]}")
fi

if [[ ${#models[@]} -eq 0 ]]; then
  echo "No models configured. Use --model or GEMINI_MODELS." >&2
  exit 1
fi

has_stdin=0
stdin_payload=""
if [[ ! -t 0 ]]; then
  has_stdin=1
  stdin_payload="$(cat)"
fi

if [[ -z "$prompt" && "$has_stdin" -eq 0 ]]; then
  echo "Provide --prompt or stdin content." >&2
  exit 1
fi

run_once() {
  local model="$1"
  local stdout_file="$2"
  local stderr_file="$3"
  local -a cmd=("gemini" "--model" "$model")

  if [[ -n "$prompt" ]]; then
    cmd+=("--prompt" "$prompt")
  fi
  if [[ ${#passthrough_args[@]} -gt 0 ]]; then
    cmd+=("${passthrough_args[@]}")
  fi

  if [[ "$has_stdin" -eq 1 ]]; then
    printf '%s' "$stdin_payload" | run_with_timeout "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
  else
    run_with_timeout "${cmd[@]}" >"$stdout_file" 2>"$stderr_file"
  fi
}

calc_sleep_seconds() {
  local base_seconds="$1"
  local jitter_percent=$((RANDOM % 41 - 20))
  awk -v b="$base_seconds" -v p="$jitter_percent" \
    'BEGIN { v=b*(1+p/100); if (v < 0.1) v=0.1; printf "%.2f", v }'
}

start_epoch="$(date +%s)"
attempt=0
backoff_index=0

log "Starting Gemini runner. Max wait: ${max_wait_seconds}s. Model order: ${models[*]}"

while true; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - start_epoch))"
  if (( elapsed >= max_wait_seconds )); then
    log "Capacity retry budget exhausted after ${elapsed}s."
    exit 42
  fi

  for model in "${models[@]}"; do
    now_epoch="$(date +%s)"
    elapsed="$((now_epoch - start_epoch))"
    if (( elapsed >= max_wait_seconds )); then
      log "Capacity retry budget exhausted after ${elapsed}s."
      exit 42
    fi

    attempt=$((attempt + 1))
    log "Attempt ${attempt}: model=${model}"

    stdout_file="$(mktemp)"
    stderr_file="$(mktemp)"
    combined_file="$(mktemp)"

    if run_once "$model" "$stdout_file" "$stderr_file"; then
      [[ -s "$stderr_file" ]] && cat "$stderr_file" >&2
      cat "$stdout_file"
      rm -f "$stdout_file" "$stderr_file" "$combined_file"
      log "Succeeded on model=${model}"
      exit 0
    else
      status="$?"
    fi

    [[ -s "$stderr_file" ]] && cat "$stderr_file" >&2
    [[ -s "$stdout_file" ]] && cat "$stdout_file"
    cat "$stdout_file" "$stderr_file" >"$combined_file"

    if (( status == 124 )) || is_capacity_error_file "$combined_file"; then
      now_epoch="$(date +%s)"
      elapsed="$((now_epoch - start_epoch))"
      if (( elapsed >= max_wait_seconds )); then
        rm -f "$stdout_file" "$stderr_file" "$combined_file"
        log "Capacity retry budget exhausted after ${elapsed}s."
        exit 42
      fi

      delay_index="$backoff_index"
      if (( delay_index >= ${#BACKOFF_SECONDS[@]} )); then
        delay_index="$((${#BACKOFF_SECONDS[@]} - 1))"
      fi
      sleep_seconds="$(calc_sleep_seconds "${BACKOFF_SECONDS[$delay_index]}")"
      backoff_index=$((backoff_index + 1))
      log "Capacity issue on model=${model}. Sleeping ${sleep_seconds}s before next attempt."
      rm -f "$stdout_file" "$stderr_file" "$combined_file"
      sleep "$sleep_seconds"
      continue
    fi

    log "Non-retryable failure on model=${model} (exit=${status})."
    rm -f "$stdout_file" "$stderr_file" "$combined_file"
    exit 1
  done
done
