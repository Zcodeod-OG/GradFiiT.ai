#!/usr/bin/env bash
# Run from Render Shell or as a Pre-Deploy command (service root = repo root).
# Applies Alembic migrations so the DB schema matches models (e.g. tryons.source from 010).
set -euo pipefail
cd "$(dirname "$0")/.."
exec alembic upgrade head
