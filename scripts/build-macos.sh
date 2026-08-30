#!/bin/bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="$REPOSITORY_ROOT/build/macos"
APP="$BUILD_ROOT/Deck Workbench.app"
ARTIFACT_ROOT="$REPOSITORY_ROOT/artifacts"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"

verify_font_sha256() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(shasum -a 256 "$path" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "NativeFontGate: unexpected SHA-256 for $path" >&2
    exit 2
  fi
}

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
verify_font_sha256 apps/macos/Resources/Fonts/pd-body-400.otf 195288dfbb409db3624ebfc3ba167aa6309c6eedd321b8a09fcf834e05fdd688
verify_font_sha256 apps/macos/Resources/Fonts/pd-body-600.otf dd46bb32b881122bd815befdb0af8a272ec648b654d878c38c975e8cb8429cd9
verify_font_sha256 apps/macos/Resources/Fonts/pd-body-700.otf 78a04f141bb723d746aa40802bc4a365277f489fab09e11eb78e9b591d90fdbc
verify_font_sha256 apps/macos/Resources/Fonts/Phosphor.ttf 06b91e022b7ee899a63efced879392a74f0bacbda54e4467e9f663220d173a10
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
mkdir -p "$APP/Contents/Resources/Workspace/fonts/v13" "$APP/Contents/Resources/Workspace/icons/phosphor" "$APP/Contents/Resources/Fonts" "$APP/Contents/Resources/Legal"
cp build/generated/workspace/fonts/v13/*.woff2 "$APP/Contents/Resources/Workspace/fonts/v13/"
cp build/generated/workspace/icons/phosphor/Phosphor.woff2 "$APP/Contents/Resources/Workspace/icons/phosphor/Phosphor.woff2"
cp apps/macos/Resources/Fonts/pd-body-400.otf "$APP/Contents/Resources/Fonts/pd-body-400.otf"
cp apps/macos/Resources/Fonts/pd-body-600.otf "$APP/Contents/Resources/Fonts/pd-body-600.otf"
cp apps/macos/Resources/Fonts/pd-body-700.otf "$APP/Contents/Resources/Fonts/pd-body-700.otf"
cp apps/macos/Resources/Fonts/Phosphor.ttf "$APP/Contents/Resources/Fonts/Phosphor.ttf"
cp LICENSE NOTICE THIRD_PARTY.md "$APP/Contents/Resources/Legal/"
cp -R legal/fontblind-v13 "$APP/Contents/Resources/Legal/fontblind-v13"
cp -R legal/phosphor-icons "$APP/Contents/Resources/Legal/phosphor-icons"
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
