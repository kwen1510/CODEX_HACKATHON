#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SECURE_ENV_FILE="${SECURE_ENV_FILE:-/tmp/codex_secrets/tool-a-intake.env}"

if [[ ! -f "${SECURE_ENV_FILE}" ]]; then
  echo "Missing secure env file: ${SECURE_ENV_FILE}" >&2
  echo "Create it with OPENAI_API_KEY and optionally TOOL_A_STORAGE_ROOT." >&2
  exit 1
fi

# Load local secrets for this process only.
set -a
# shellcheck disable=SC1090
source "${SECURE_ENV_FILE}"
set +a

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is missing in ${SECURE_ENV_FILE}" >&2
  exit 1
fi

export TOOL_A_STORAGE_ROOT="${TOOL_A_STORAGE_ROOT:-/tmp/codex_hackathon_storage}"

cd "${APP_ROOT}"
node scripts/process_queue.js "$@"
