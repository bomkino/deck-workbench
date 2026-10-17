#!/bin/bash
# Proves in-app updates work, in CI for every change and on a Mac, without
# pitch.dog's real key. Test copies of the packaged app (another name and
# bundle identifier, no document types, trusting only a throwaway key) are
# made from build/native/Deck Workbench.app; scripts/sign-release.sh signs the
# newer one into a local feed, exactly as a release is signed.
#
#   bash scripts/test-update.sh        # after scripts/build-native-macos.sh
#
#   1. 9.0.0 reads the feed and installs 9.0.1, and 9.0.1 starts as a new
#      process, says it is running, and keeps running.
#   2. With one byte of the served ZIP changed, 9.0.0 refuses it and stays.
#
# Needs a logged-in session (the app opens a window).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILT="$ROOT/build/native/Deck Workbench.app"
[ -d "$BUILT" ] || { echo "Build $BUILT first (scripts/build-native-macos.sh)" >&2; exit 1; }
T="$(mktemp -d)"
NAME="Deck Workbench Update Test"
ID="dog.pitch.deck-workbench.updatetest"
EXE="$NAME.app/Contents/MacOS/DeckWorkbench"
PORT=8765

cleanup() {
  pkill -f "$EXE" 2>/dev/null || true
  [ -n "${SERVER:-}" ] && kill "$SERVER" 2>/dev/null || true
  defaults delete "$ID" 2>/dev/null || true
  rm -rf "$T"
}
trap cleanup EXIT

echo "== A throwaway signing key"
cat > "$T/key.swift" <<'SWIFT'
import CryptoKit
import Foundation
let key = Curve25519.Signing.PrivateKey()
try! key.rawRepresentation.base64EncodedString().write(toFile: CommandLine.arguments[1], atomically: true, encoding: .utf8)
print(key.publicKey.rawRepresentation.base64EncodedString())
SWIFT
PUBLIC="$(swift "$T/key.swift" "$T/key")"

# A copy of the packaged app at version $1 that trusts only the throwaway key
# and claims no documents, so it never touches the real app or its files.
copy() {
  local app="$2/$NAME.app" plist="$2/$NAME.app/Contents/Info.plist"
  mkdir -p "$2"
  ditto "$BUILT" "$app"
  /usr/libexec/PlistBuddy \
    -c "Set :CFBundleShortVersionString $1" \
    -c "Set :CFBundleVersion $(echo "$1" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }')" \
    -c "Set :CFBundleIdentifier $ID" -c "Set :CFBundleName '$NAME'" -c "Set :CFBundleDisplayName '$NAME'" \
    -c "Set :SUPublicEDKey $PUBLIC" -c "Delete :CFBundleDocumentTypes" -c "Delete :UTExportedTypeDeclarations" \
    "$plist"
  codesign --force --sign - "$app"
  codesign --verify --deep --strict "$app"
}

echo "== Test copies at 9.0.0 (installed) and 9.0.1 (on the feed)"
copy 9.0.0 "$T/old"
copy 9.0.1 "$T/new"
mkdir -p "$T/feed" "$T/install"
ZIP="Deck-Workbench-update-test-9.0.1.app.zip"
ditto -c -k --sequesterRsrc --keepParent "$T/new/$NAME.app" "$T/feed/$ZIP"
(cd "$T/feed" && shasum -a 256 "$ZIP" > "$ZIP.sha256")
SPARKLE_KEY="$T/key" DOWNLOAD_URL="http://127.0.0.1:$PORT/" bash "$ROOT/scripts/sign-release.sh" "$T/feed"
rm -f "$T/key"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$T/feed" 2> "$T/server.log" &
SERVER=$!
sleep 1

version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$T/install/$NAME.app/Contents/Info.plist"; }

# A running copy writes "version process" here once it is up (read from its
# defaults, which a relaunch keeps; it doesn't keep the environment).
READY="$T/ready"
defaults write "$ID" UpdateTestReadyFile "$READY"

# Installs a fresh 9.0.0 and runs it against the feed for up to $1 seconds,
# stopping early once its files say 9.0.1. OLD is the process it started as.
run() {
  pkill -f "$EXE" 2>/dev/null || true
  rm -rf "$T/install/$NAME.app" && ditto "$T/old/$NAME.app" "$T/install/$NAME.app"
  rm -f "$READY"
  : > "$T/server.log"
  STUDIO_UPDATE_TEST=1 STUDIO_UPDATE_FEED="http://127.0.0.1:$PORT/appcast.xml" \
    "$T/install/$EXE" > "$T/app.log" 2>&1 &
  OLD=$!
  for _ in $(seq "$1"); do
    sleep 1
    [ "$(version)" = 9.0.1 ] && break
  done
  # Waiting out the time is no failure in itself (a refused update never says
  # 9.0.1): the checks after each run decide.
  return 0
}

stop() {
  sleep 2
  pkill -f "$EXE" 2>/dev/null || true
}

echo "== 1. A signed update installs and the new version runs"
run 90
grep -q "GET /$ZIP" "$T/server.log" || { echo "FAIL: the ZIP was never fetched"; cat "$T/server.log" "$T/app.log"; exit 1; }
[ "$(version)" = 9.0.1 ] || { echo "FAIL: still $(version) after the update"; cat "$T/server.log"; tail -40 "$T/app.log"; exit 1; }
codesign --verify --deep --strict "$T/install/$NAME.app"
NEW=""
for _ in $(seq 60); do
  if read -r v pid < "$READY" 2>/dev/null && [ "$v" = 9.0.1 ] && [ "$pid" != "$OLD" ]; then NEW="$pid"; break; fi
  sleep 1
done
[ -n "$NEW" ] || { echo "FAIL: 9.0.1 is on disk, but no new process ever said it was running"; cat "$READY" 2>/dev/null; tail -40 "$T/app.log"; exit 1; }
sleep 3
kill -0 "$NEW" 2>/dev/null || { echo "FAIL: 9.0.1 started (process $NEW) but stopped within three seconds"; exit 1; }
echo "   9.0.0 (process $OLD) fetched $ZIP, and 9.0.1 relaunched as process $NEW and kept running"
stop

echo "== 2. A ZIP with one byte changed is refused"
python3 - "$T/feed/$ZIP" <<'PY'
import sys
p = sys.argv[1]
b = bytearray(open(p, "rb").read())
b[len(b) // 2] ^= 0x01
open(p, "wb").write(b)
PY
run 30
stop
grep -q "GET /$ZIP" "$T/server.log" || { echo "FAIL: the tampered ZIP was never fetched, so nothing was tested"; cat "$T/server.log"; exit 1; }
[ "$(version)" = 9.0.0 ] || { echo "FAIL: a tampered update was installed ($(version))"; exit 1; }
echo "   9.0.0 fetched the tampered $ZIP and stayed at $(version)"
echo "== In-app updates: OK"
