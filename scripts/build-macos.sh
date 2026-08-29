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
node scripts/build-packaged-tracer.mjs

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "ExactCommitGate: refusing to package a dirty working tree as $COMMIT_SHA" >&2
  exit 2
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Kernel" "$APP/Contents/Resources/Workspace" "$ARTIFACT_ROOT"

cp apps/macos/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DeckWorkbenchCommit string $COMMIT_SHA" "$APP/Contents/Info.plist"
cp build/generated/workspace/index.html "$APP/Contents/Resources/Workspace/index.html"
cp build/generated/workspace/styles.css "$APP/Contents/Resources/Workspace/styles.css"
cp build/generated/workspace/workspace.js "$APP/Contents/Resources/Workspace/workspace.js"
cp build/generated/workspace/workbench-mark.svg "$APP/Contents/Resources/Workspace/workbench-mark.svg"
scripts/build-macos-icon.sh "$APP/Contents/Resources/DeckWorkbench.icns"
cp build/generated/bridge.generated.js "$APP/Contents/Resources/Workspace/bridge.generated.js"
cp build/generated/deck-kernel.js "$APP/Contents/Resources/Kernel/deck-kernel.js"

MACOS_SOURCES=()
while IFS= read -r source; do
  MACOS_SOURCES+=("$source")
done < <(find apps/macos/Sources -maxdepth 1 -name '*.swift' ! -name 'PackagedTracer.swift' -print | sort)

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
  build/generated/PackagedTracer.swift \
  "${MACOS_SOURCES[@]}" \
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
