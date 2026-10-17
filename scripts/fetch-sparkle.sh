#!/bin/bash
# Prints the folder holding Sparkle 2.10.0 (Sparkle.framework, its LICENSE and
# its signing tools in bin/), downloading and checksum-verifying the upstream
# release once into build/vendor. Used by the native build, the update test
# and the release workflow (docs/UPDATES.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=2.10.0
SHA256=c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c
DEST="$ROOT/build/vendor/sparkle-$VERSION"
if [ ! -f "$DEST/.verified" ]; then
  rm -rf "$DEST" "$DEST.download"
  mkdir -p "$DEST.download/contents"
  curl -fsSL --retry 3 -o "$DEST.download/sparkle.tar.xz" \
    "https://github.com/sparkle-project/Sparkle/releases/download/$VERSION/Sparkle-$VERSION.tar.xz"
  echo "$SHA256  $DEST.download/sparkle.tar.xz" | shasum -a 256 -c - >&2
  tar -xf "$DEST.download/sparkle.tar.xz" -C "$DEST.download/contents"
  mv "$DEST.download/contents" "$DEST"
  rm -rf "$DEST.download"
  echo "$SHA256" > "$DEST/.verified"
fi
echo "$DEST"
