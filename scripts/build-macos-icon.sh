#!/bin/bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPOSITORY_ROOT/apps/macos/Resources/Workspace/workbench-mark.svg"
OUTPUT="${1:-$REPOSITORY_ROOT/build/macos/DeckWorkbench.icns}"
ICON_ROOT="$(mktemp -d)"
ICONSET="$ICON_ROOT/DeckWorkbench.iconset"
trap 'rm -rf "$ICON_ROOT"' EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "IconGate: macOS is required" >&2
  exit 2
fi

mkdir -p "$ICONSET" "$(dirname "$OUTPUT")"
while read -r filename pixels; do
  sips -s format png -z "$pixels" "$pixels" "$SOURCE" --out "$ICONSET/$filename" >/dev/null
done <<'SIZES'
icon_16x16.png 16
icon_16x16@2x.png 32
icon_32x32.png 32
icon_32x32@2x.png 64
icon_128x128.png 128
icon_128x128@2x.png 256
icon_256x256.png 256
icon_256x256@2x.png 512
icon_512x512.png 512
icon_512x512@2x.png 1024
SIZES

iconutil -c icns "$ICONSET" -o "$OUTPUT"
test -s "$OUTPUT"
