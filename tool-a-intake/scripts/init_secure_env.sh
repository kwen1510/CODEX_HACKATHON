#!/usr/bin/env bash
set -euo pipefail

SECURE_ENV_FILE="${SECURE_ENV_FILE:-/tmp/codex_secrets/tool-a-intake.env}"
SECURE_ENV_DIR="$(dirname "${SECURE_ENV_FILE}")"

mkdir -p "${SECURE_ENV_DIR}"
chmod 700 "${SECURE_ENV_DIR}" || true

if [[ -f "${SECURE_ENV_FILE}" ]]; then
  echo "Secure env already exists: ${SECURE_ENV_FILE}"
else
  cat > "${SECURE_ENV_FILE}" <<'EOF'
OPENAI_API_KEY=replace_me
TOOL_A_STORAGE_ROOT=/tmp/codex_hackathon_storage
PORT=8787
MAX_UPLOAD_BYTES=26214400
EOF
  echo "Created secure env template: ${SECURE_ENV_FILE}"
fi

chmod 600 "${SECURE_ENV_FILE}"
echo "Set permissions: 600 ${SECURE_ENV_FILE}"
