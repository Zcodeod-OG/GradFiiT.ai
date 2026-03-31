#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${PYTHON_BIN:-}" ]]; then
	PYTHON_BIN="python"
fi

echo "[quick-download] generating model manifest"
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/download_models.py"

echo "[quick-download] verifying model accessibility"
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/verify_model.py"

echo "[quick-download] complete"
