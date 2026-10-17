#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
ZIP="$ROOT/artifacts/Deck-Workbench-apple-silicon-$SHA.app.zip"
EXTRACT="$(mktemp -d)"
trap 'rm -rf "$EXTRACT"' EXIT
test -f "$ZIP" || { echo "No build of $SHA in artifacts/: run scripts/build-native-macos.sh on this commit first" >&2; exit 1; }
(cd "$ROOT/artifacts"; shasum -a 256 -c "$(basename "$ZIP").sha256")
ditto -x -k "$ZIP" "$EXTRACT"
APP="$EXTRACT/Deck Workbench.app"
codesign --verify --deep --strict "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :DeckWorkbenchCommit' "$APP/Contents/Info.plist")" = "$SHA"
test "$(lipo -archs "$APP/Contents/MacOS/DeckWorkbench")" = arm64
"$APP/Contents/MacOS/DeckWorkbench" --native-self-test "$ROOT/artifacts/evidence"
# The same acceptance rule the release applies (scripts/check-native-acceptance.py).
python3 "$ROOT/scripts/check-native-acceptance.py" "$ROOT/artifacts/evidence/native-acceptance.json" "$SHA"
