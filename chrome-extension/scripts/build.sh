#!/usr/bin/env bash
# Rewrite chrome-extension/config.js with the URLs of the current
# deployment. Use this before zipping the extension for the Chrome
# Web Store or after pointing your frontend at a new domain.
#
# Usage:
#   GRADFIT_APP_URL=https://gradfit.tech \
#   GRADFIT_API_URL=https://gradfit-ai.onrender.com \
#   bash chrome-extension/scripts/build.sh
#
# Without env vars set, the script falls back to the production URLs
# already baked into config.js so re-running it is a no-op.

set -euo pipefail

cd "$(dirname "$0")/.."

APP_URL="${GRADFIT_APP_URL:-https://gradfit.tech}"
API_URL="${GRADFIT_API_URL:-https://gradfit-ai.onrender.com}"

if [[ -z "$APP_URL" || -z "$API_URL" ]]; then
  echo "Both GRADFIT_APP_URL and GRADFIT_API_URL must be non-empty." >&2
  exit 1
fi

# Validate they look like absolute http(s) URLs so we don't accidentally
# ship "localhost" to the Chrome Web Store.
for url in "$APP_URL" "$API_URL"; do
  if [[ ! "$url" =~ ^https?://[^[:space:]]+$ ]]; then
    echo "Refusing to write malformed URL: $url" >&2
    exit 1
  fi
done

# Escape forward slashes for sed (the URLs contain `/`).
escape() { printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'; }

APP_URL_ESC=$(escape "$APP_URL")
API_URL_ESC=$(escape "$API_URL")

# Rewrite the two `var APP_URL = "…";` / `var API_URL = "…";` lines in
# place. Matches the comment line above each so we only touch the two
# placeholder declarations and never a stray match elsewhere.
tmp=$(mktemp)
sed \
  -e "s#var APP_URL = \"[^\"]*\";#var APP_URL = \"$APP_URL_ESC\";#" \
  -e "s#var API_URL = \"[^\"]*\";#var API_URL = \"$API_URL_ESC\";#" \
  config.js > "$tmp"
mv "$tmp" config.js

echo "config.js updated:"
echo "  APP_URL=$APP_URL"
echo "  API_URL=$API_URL"
