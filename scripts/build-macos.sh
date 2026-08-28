#!/bin/bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$REPOSITORY_ROOT/build/macos"
APP="$BUILD_ROOT/Deck Workbench.app"
ARTIFACT_ROOT="$REPOSITORY_ROOT/artifacts"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "NativeGate: macOS is required" >&2
  exit 2
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "NativeGate: Apple Silicon arm64 host is required" >&2
  exit 2
fi

MACOS_MAJOR="$(sw_vers -productVersion | cut -d. -f1)"
if (( MACOS_MAJOR < 26 )); then
  echo "NativeGate: macOS 26 or newer is required" >&2
  exit 2
fi

cd "$REPOSITORY_ROOT"
npm run generate

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "ExactCommitGate: refusing to package a dirty working tree as $COMMIT_SHA" >&2
  exit 2
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Kernel" "$APP/Contents/Resources/Workspace" "$ARTIFACT_ROOT"

cp apps/macos/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DeckWorkbenchCommit string $COMMIT_SHA" "$APP/Contents/Info.plist"
cp apps/macos/Resources/Workspace/index.html "$APP/Contents/Resources/Workspace/index.html"
cp apps/macos/Resources/Workspace/styles.css "$APP/Contents/Resources/Workspace/styles.css"
cp apps/macos/Resources/Workspace/workspace.js "$APP/Contents/Resources/Workspace/workspace.js"
cp apps/macos/Resources/Workspace/workbench-mark.svg "$APP/Contents/Resources/Workspace/workbench-mark.svg"
cp packages/workspace/src/scale-model.mjs "$APP/Contents/Resources/Workspace/scale-model.mjs"
cp build/generated/bridge.generated.js "$APP/Contents/Resources/Workspace/bridge.generated.js"
cp build/generated/deck-kernel.js "$APP/Contents/Resources/Kernel/deck-kernel.js"

swiftc \
  -O \
  -target arm64-apple-macosx26.0 \
  -framework AppKit \
  -framework Combine \
  -framework CryptoKit \
  -framework JavaScriptCore \
  -framework PDFKit \
  -framework SwiftUI \
  -framework UniformTypeIdentifiers \
  -framework WebKit \
  build/generated/GeneratedBridge.swift \
  apps/macos/Sources/*.swift \
  -o "$APP/Contents/MacOS/DeckWorkbench"

plutil -lint "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

ZIP="$ARTIFACT_ROOT/Deck-Workbench-apple-silicon-${COMMIT_SHA}.app.zip"
rm -f "$ZIP" "$ZIP.sha256"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(
  cd "$ARTIFACT_ROOT"
  shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256"
)

echo "$ZIP"
