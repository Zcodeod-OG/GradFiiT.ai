#!/usr/bin/env bash
# Build a Chrome Web Store / Edge / Opera / Brave submission ZIP.
#
# Usage:
#   GRADFIT_APP_URL=https://gradfit.tech \
#   GRADFIT_API_URL=https://gradfit-ai.onrender.com \
#   bash scripts/package-store.sh
#
# Sets GRADFIT_STORE_BUILD=1 so config.js omits localhost dev origins.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_URL="${GRADFIT_APP_URL:-https://gradfit.tech}"
API_URL="${GRADFIT_API_URL:-https://gradfit-ai.onrender.com}"

if [[ -z "$APP_URL" || -z "$API_URL" ]]; then
  echo "Both GRADFIT_APP_URL and GRADFIT_API_URL must be non-empty." >&2
  exit 1
fi

for url in "$APP_URL" "$API_URL"; do
  if [[ ! "$url" =~ ^https?://[^[:space:]]+$ ]]; then
    echo "Refusing to build with malformed URL: $url" >&2
    exit 1
  fi
  if [[ "$url" =~ localhost|127\.0\.0\.1 ]]; then
    echo "Store builds must not use localhost API/app URLs: $url" >&2
    exit 1
  fi
done

VERSION="$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")"
DIST_DIR="$ROOT/dist"
STAGING="$DIST_DIR/staging"
ZIP_NAME="gradfit-extension-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

export GRADFIT_APP_URL="$APP_URL"
export GRADFIT_API_URL="$API_URL"
export GRADFIT_STORE_BUILD=1

echo "==> Rewriting config.js (production URLs, store build)"
bash scripts/build.sh

# Mark store build in config (build.sh does not touch this line)
tmp="$(mktemp)"
sed 's/var STORE_BUILD = "__GRADFIT_STORE_BUILD__" === "1";/var STORE_BUILD = true;/' config.js > "$tmp"
mv "$tmp" config.js

rm -rf "$STAGING"
mkdir -p "$STAGING"

echo "==> Copying extension files"
rsync -a \
  --exclude 'dist/' \
  --exclude 'scripts/' \
  --exclude 'store/' \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'README.md' \
  "$ROOT/" "$STAGING/"

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"
(
  cd "$STAGING"
  zip -r -q "$ZIP_PATH" . -x "*.DS_Store"
)

echo "==> Restoring config.js dev placeholder (non-store)"
export GRADFIT_STORE_BUILD=0
bash scripts/build.sh
tmp="$(mktemp)"
sed 's/var STORE_BUILD = true;/var STORE_BUILD = "__GRADFIT_STORE_BUILD__" === "1";/' config.js > "$tmp"
mv "$tmp" config.js

if command -v shasum >/dev/null 2>&1; then
  echo "SHA256:"
  shasum -a 256 "$ZIP_PATH"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ZIP_PATH"
fi

echo ""
echo "Created: $ZIP_PATH"
echo "  APP_URL=$APP_URL"
echo "  API_URL=$API_URL"
echo "  version=$VERSION"
echo ""
echo "Next: see store/SUBMISSION_CHECKLIST.md"
