#!/bin/bash
# Signs a release's ZIP into the update feed (appcast.xml) that installed
# copies of Deck Workbench read. Nothing is rebuilt: the ZIP is the exact CI
# artifact the release publishes.
#
#   SPARKLE_KEY=<key file> DOWNLOAD_URL=<where the ZIP is served> \
#     bash scripts/sign-release.sh <folder> [release-notes.md]
#
#   1. checks the folder's one Deck-Workbench-*.app.zip against its .sha256
#   2. reads the version, build and trusted public key of the app inside
#   3. signs the ZIP (generate_appcast --ed-key-file) into <folder>/appcast.xml,
#      with the release notes for the update window when given
#   4. checks the signature with the public key inside the app, as Sparkle will
#
# The release workflow runs it with the key from the `release` environment;
# scripts/test-update.sh runs it with a throwaway key. SPARKLE_BIN defaults to
# the tools fetched by scripts/fetch-sparkle.sh.
#
# The key is only ever read by generate_appcast, from its file. Never commit
# it, paste it anywhere or print it (docs/UPDATES.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "sign-release: $*" >&2; exit 1; }
DIR="${1:?Pass the folder holding the release ZIP}"
NOTES="${2:-}"
[ -n "${SPARKLE_KEY:-}" ] && [ -f "$SPARKLE_KEY" ] || fail "SPARKLE_KEY must name the private key file"
[ -n "${DOWNLOAD_URL:-}" ] || fail "DOWNLOAD_URL must say where the ZIP will be served"
SPARKLE_BIN="${SPARKLE_BIN:-$("$ROOT/scripts/fetch-sparkle.sh")/bin}"
[ -x "$SPARKLE_BIN/generate_appcast" ] || fail "Sparkle's tools aren't at $SPARKLE_BIN"
SRC="$(cd "$DIR" && pwd)"
ZIPS=("$SRC"/Deck-Workbench-*.app.zip)
[ "${#ZIPS[@]}" = 1 ] && [ -f "${ZIPS[0]}" ] || fail "expected exactly one Deck-Workbench-*.app.zip in $SRC"
ZIP="$(basename "${ZIPS[0]}")"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

echo "== 1. $ZIP"
(cd "$SRC" && shasum -a 256 -c "$ZIP.sha256") || fail "$ZIP doesn't match $ZIP.sha256"

echo "== 2. The app inside"
ditto -x -k "$SRC/$ZIP" "$T/app"
PLIST="$T/app/Deck Workbench.app/Contents/Info.plist"
[ -f "$PLIST" ] || PLIST="$(ls -d "$T"/app/*.app | head -1)/Contents/Info.plist"
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PLIST")"
BUILD="$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PLIST")"
PUBLIC="$(/usr/libexec/PlistBuddy -c "Print :SUPublicEDKey" "$PLIST")"
[ "$BUILD" = "$(echo "$VERSION" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }')" ] || fail "build $BUILD doesn't follow version $VERSION"
echo "   $VERSION (build $BUILD), trusting key $PUBLIC"

echo "== 3. Signing"
mkdir -p "$T/cast"
cp "$SRC/$ZIP" "$T/cast/"
# generate_appcast takes notes with the archive's name, less its last extension.
[ -z "$NOTES" ] || cp "$NOTES" "$T/cast/${ZIP%.zip}.md"
"$SPARKLE_BIN/generate_appcast" --ed-key-file "$SPARKLE_KEY" --download-url-prefix "$DOWNLOAD_URL" \
  --link "https://github.com/bomkino/deck-workbench/releases" ${NOTES:+--embed-release-notes} --maximum-versions 1 \
  -o "$T/appcast.xml" "$T/cast" > "$T/generate.log" || { cat "$T/generate.log"; fail "generate_appcast failed"; }
xmllint --noout "$T/appcast.xml"
grep -Eq "shortVersionString(>|=\")$VERSION[<\"]" "$T/appcast.xml" || fail "the appcast doesn't name $VERSION"
grep -q "url=\"$DOWNLOAD_URL$ZIP\"" "$T/appcast.xml" || fail "the appcast doesn't point at $DOWNLOAD_URL$ZIP"
SIG="$(sed -n 's/.*sparkle:edSignature="\([^"]*\)".*/\1/p' "$T/appcast.xml" | head -1)"
# Sparkle signs only with the key whose public half is in the app; with any
# other key it warns and leaves the appcast unsigned.
if [ -z "$SIG" ]; then
  grep -i "warning\|error" "$T/generate.log" || true
  fail "Sparkle left the appcast unsigned: is SPARKLE_KEY the key whose public half is $PUBLIC?"
fi

echo "== 4. Checking the signature with the key inside the app"
cat > "$T/verify.swift" <<'SWIFT'
import CryptoKit
import Foundation
let a = CommandLine.arguments
guard let key = Data(base64Encoded: a[1]), let sig = Data(base64Encoded: a[2]),
      let file = FileManager.default.contents(atPath: a[3]),
      let pub = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else { exit(2) }
exit(pub.isValidSignature(sig, for: file) ? 0 : 1)
SWIFT
swift "$T/verify.swift" "$PUBLIC" "$SIG" "$SRC/$ZIP" || fail "the app wouldn't accept this signature: is SPARKLE_KEY the key whose public half is $PUBLIC?"
cp "$T/appcast.xml" "$SRC/appcast.xml"
echo "== Signed: $SRC/appcast.xml"
