#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
SHA="$(git rev-parse HEAD)"
node scripts/build-kernel.mjs
if ! git diff --quiet || ! git diff --cached --quiet; then echo 'Refusing to package uncommitted source' >&2; exit 1; fi
APP="$ROOT/build/native/Deck Workbench.app"
rm -rf "$ROOT/build/native"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Kernel" "$APP/Contents/Resources/Fonts" "$APP/Contents/Resources/Legal" "$ROOT/artifacts"
cp apps/macos/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DeckWorkbenchCommit string $SHA" "$APP/Contents/Info.plist"
cp build/generated/deck-kernel.js "$APP/Contents/Resources/Kernel/"
cp apps/macos/Resources/Fonts/*.otf apps/macos/Resources/Fonts/*.ttf "$APP/Contents/Resources/Fonts/"
cp LICENSE NOTICE THIRD_PARTY.md "$APP/Contents/Resources/Legal/"
cp -R legal/fontblind-v13 legal/phosphor-icons "$APP/Contents/Resources/Legal/"
scripts/build-macos-icon.sh "$APP/Contents/Resources/DeckWorkbench.icns"
swiftc -O -swift-version 5 -target arm64-apple-macosx26.0 \
  -framework AppKit -framework AVFoundation -framework Combine -framework CoreGraphics -framework CoreText \
  -framework CryptoKit -framework ImageIO -framework JavaScriptCore -framework PDFKit -framework SwiftUI \
  -framework UniformTypeIdentifiers \
  apps/macos/Sources/Native*.swift \
  apps/macos/Sources/DeckKernelHost.swift apps/macos/Sources/MediaCatalogSession.swift \
  apps/macos/Sources/PitchDeckDocumentStore.swift apps/macos/Sources/WorkbenchFailure.swift \
  -o "$APP/Contents/MacOS/DeckWorkbench"
plutil -lint "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
ZIP="$ROOT/artifacts/Deck-Workbench-apple-silicon-$SHA.app.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(cd "$ROOT/artifacts"; shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")
echo "$ZIP"
