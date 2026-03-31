#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[install] root: ${ROOT_DIR}"

if [[ -z "${PYTHON_BIN:-}" ]]; then
	PYTHON_BIN="python"
fi

echo "[install] using python: ${PYTHON_BIN}"

"${PYTHON_BIN}" -m pip install --upgrade pip
"${PYTHON_BIN}" -m pip install -r "${ROOT_DIR}/requirements.txt"

echo "[install] running smoke test"
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/test_installation.py"

echo "[install] done"
