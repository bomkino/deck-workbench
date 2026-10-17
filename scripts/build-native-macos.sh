#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
SHA="$(git rev-parse HEAD)"
npm ci --ignore-scripts --no-audit --no-fund
node scripts/build-kernel.mjs
node scripts/build-psd-encoder.mjs
if ! git diff --quiet || ! git diff --cached --quiet; then echo 'Refusing to package uncommitted source' >&2; exit 1; fi
# Sparkle compares CFBundleVersion, so it follows the version: 0.4.0 -> 400,
# 1.4.2 -> 10402. Versions only go up (docs/UPDATES.md).
VERSION="$(node -p 'require("./package.json").version')"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' apps/macos/Info.plist)" = "$VERSION"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' apps/macos/Info.plist)" = "$(echo "$VERSION" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }')"
SPARKLE="$(scripts/fetch-sparkle.sh)"
cmp "$SPARKLE/LICENSE" legal/sparkle/LICENSE
APP="$ROOT/build/native/Deck Workbench.app"
rm -rf "$ROOT/build/native"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Frameworks" "$APP/Contents/Resources/Kernel" "$APP/Contents/Resources/Fonts" "$APP/Contents/Resources/Legal" "$ROOT/artifacts"
cp apps/macos/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DeckWorkbenchCommit string $SHA" "$APP/Contents/Info.plist"
cp build/generated/deck-kernel.js "$APP/Contents/Resources/Kernel/"
cp build/generated/psd-encoder.js "$APP/Contents/Resources/Kernel/"
cp apps/macos/Resources/Fonts/*.otf apps/macos/Resources/Fonts/*.ttf "$APP/Contents/Resources/Fonts/"
cp LICENSE NOTICE THIRD_PARTY.md "$APP/Contents/Resources/Legal/"
cp -R legal/fontblind-v13 legal/phosphor-icons legal/psd-encoder legal/radix-colors legal/sparkle "$APP/Contents/Resources/Legal/"
# Sparkle exactly as released, keeping the signature its makers gave it.
ditto "$SPARKLE/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"
cp -R apps/macos/Resources/StarterKit "$APP/Contents/Resources/StarterKit"
scripts/build-macos-icon.sh "$APP/Contents/Resources/DeckWorkbench.icns"
swiftc -O -swift-version 5 -sdk "${SDKROOT:-$(xcrun --show-sdk-path)}" -target arm64-apple-macosx26.0 \
  -framework AppKit -framework AVFoundation -framework Combine -framework CoreGraphics -framework CoreText \
  -framework CryptoKit -framework ImageIO -framework JavaScriptCore -framework PDFKit -framework SwiftUI \
  -framework UniformTypeIdentifiers -F "$SPARKLE" -framework Sparkle \
  -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
  apps/macos/Sources/Native*.swift \
  apps/macos/Sources/DeckKernelHost.swift apps/macos/Sources/MediaCatalogSession.swift \
  apps/macos/Sources/PitchDeckDocumentStore.swift apps/macos/Sources/WorkbenchFailure.swift \
  -o "$APP/Contents/MacOS/DeckWorkbench"
plutil -lint "$APP/Contents/Info.plist"
# Ad hoc, and not --deep: --deep would re-sign Sparkle's helpers and strip
# their entitlements.
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
ZIP="$ROOT/artifacts/Deck-Workbench-apple-silicon-$SHA.app.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
(cd "$ROOT/artifacts"; shasum -a 256 "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")
echo "$ZIP"
