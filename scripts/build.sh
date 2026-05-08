#!/usr/bin/env bash
# Build a Chrome Web Store / Edge Add-ons zip from the repo root.
# Reads the version from manifest.json and writes
# heading-inspector-v{version}.zip into the repo root.

set -euo pipefail

cd "$(dirname "$0")/.."

if command -v jq >/dev/null 2>&1; then
  version=$(jq -r .version manifest.json)
else
  version=$(grep -E '"version":' manifest.json | sed -E 's/.*"version":[[:space:]]*"([^"]+)".*/\1/')
fi

zipname="heading-inspector-v${version}.zip"

rm -f "$zipname"
zip -r "$zipname" \
  manifest.json \
  background.js \
  content.js \
  icons \
  LICENSE \
  >/dev/null

size=$(du -h "$zipname" | cut -f1)
printf 'Built %s (%s)\n' "$zipname" "$size"
