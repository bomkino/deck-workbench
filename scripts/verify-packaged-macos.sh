#!/bin/bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
ZIP="${1:-$REPOSITORY_ROOT/artifacts/Deck-Workbench-apple-silicon-${COMMIT_SHA}.app.zip}"
EXTRACT_ROOT="$(mktemp -d)"
JOURNEY_ROOT="$(mktemp -d)"
KEYBOARD_UI_MODE_PRESENT=0
KEYBOARD_UI_MODE_BEFORE=""
if KEYBOARD_UI_MODE_BEFORE="$(defaults read NSGlobalDomain AppleKeyboardUIMode 2>/dev/null)"; then
  KEYBOARD_UI_MODE_PRESENT=1
fi

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$KEYBOARD_UI_MODE_PRESENT" == "1" ]]; then
    defaults write NSGlobalDomain AppleKeyboardUIMode -int "$KEYBOARD_UI_MODE_BEFORE" >/dev/null
  else
    defaults delete NSGlobalDomain AppleKeyboardUIMode >/dev/null 2>&1 || true
  fi
  rm -rf "$EXTRACT_ROOT" "$JOURNEY_ROOT"
  exit "$status"
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "NativeGate: packaged verification requires Apple-Silicon macOS" >&2
  exit 2
fi

defaults write NSGlobalDomain AppleKeyboardUIMode -int 3 >/dev/null
if [[ "$(defaults read NSGlobalDomain AppleKeyboardUIMode)" != "3" ]]; then
  echo "NativeGate: packaged keyboard journey requires Full Keyboard Access" >&2
  exit 2
fi
echo "DW-T00 keyboard UI mode enabled for packaged accessibility journey"

test -f "$ZIP"
test -f "$ZIP.sha256"
(
  cd "$(dirname "$ZIP")"
  shasum -a 256 -c "$(basename "$ZIP").sha256"
)
unzip -t "$ZIP"
ditto -x -k "$ZIP" "$EXTRACT_ROOT"

APP="$EXTRACT_ROOT/Deck Workbench.app"
BINARY="$APP/Contents/MacOS/DeckWorkbench"
test -x "$BINARY"
test "$(lipo -archs "$BINARY")" = "arm64"
file "$BINARY" | grep -q 'arm64'
if file "$BINARY" | grep -q 'x86_64'; then
  echo "ArchitectureFailure: x86_64 slice found" >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$APP"
test "$(plutil -extract LSMinimumSystemVersion raw "$APP/Contents/Info.plist")" = "26.0"
test "$(plutil -extract DeckWorkbenchCommit raw "$APP/Contents/Info.plist")" = "$COMMIT_SHA"
test "$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")" = "0.0.1"
test "$(plutil -extract CFBundleIconFile raw "$APP/Contents/Info.plist")" = "DeckWorkbench.icns"
test "$(plutil -extract ATSApplicationFontsPath raw "$APP/Contents/Info.plist")" = "Fonts"
test -s "$APP/Contents/Resources/DeckWorkbench.icns"
for legal_file in LICENSE NOTICE THIRD_PARTY.md; do
  test -s "$APP/Contents/Resources/Legal/$legal_file"
  cmp "$REPOSITORY_ROOT/$legal_file" "$APP/Contents/Resources/Legal/$legal_file"
done
node "$REPOSITORY_ROOT/scripts/verify-workspace-type-assets.mjs" \
  "$APP/Contents/Resources/Workspace" \
  "$APP/Contents/Resources/Legal" \
  "$APP/Contents/Resources/Fonts/Phosphor.ttf"

DOCUMENT="$JOURNEY_ROOT/Tracer.pitchdeck"
CREATE_RESULT="$JOURNEY_ROOT/create-result.json"
PDF="$JOURNEY_ROOT/tracer.pdf"
REOPEN_RESULT="$JOURNEY_ROOT/reopen-result.json"

"$BINARY" --tracer-create "$DOCUMENT" "$CREATE_RESULT"
test -f "$DOCUMENT/manifest.json"
test -f "$DOCUMENT/checkpoint.json"
test -f "$DOCUMENT/journal.ndjson"
test "$(wc -l < "$DOCUMENT/journal.ndjson" | tr -d ' ')" = "3"

"$BINARY" --tracer-reopen "$DOCUMENT" "$PDF" "$REOPEN_RESULT"
test -s "$PDF"
test "$(wc -l < "$DOCUMENT/journal.ndjson" | tr -d ' ')" = "4"

swift -e 'import Foundation; import PDFKit; let u = URL(fileURLWithPath: CommandLine.arguments[1]); guard let d = PDFDocument(url: u), d.pageCount == 1 else { exit(1) }' "$PDF"
node "$REPOSITORY_ROOT/scripts/verify-tracer-output.mjs" "$DOCUMENT" "$CREATE_RESULT" "$REOPEN_RESULT" "$PDF"

STORY_DOCUMENT="$JOURNEY_ROOT/Story.pitchdeck"
STORY_CREATE_RESULT="$JOURNEY_ROOT/story-create-result.json"
STORY_REOPEN_RESULT="$JOURNEY_ROOT/story-reopen-result.json"

"$BINARY" --tracer-story-create "$STORY_DOCUMENT" "$STORY_CREATE_RESULT"
test -f "$STORY_DOCUMENT/manifest.json"
test -f "$STORY_DOCUMENT/checkpoint.json"
test -f "$STORY_DOCUMENT/journal.ndjson"
test "$(wc -l < "$STORY_DOCUMENT/journal.ndjson" | tr -d ' ')" = "22"

"$BINARY" --tracer-story-reopen "$STORY_DOCUMENT" "$STORY_CREATE_RESULT" "$STORY_REOPEN_RESULT"
test "$(wc -l < "$STORY_DOCUMENT/journal.ndjson" | tr -d ' ')" = "46"
node "$REPOSITORY_ROOT/scripts/verify-story-tracer-output.mjs" \
  "$STORY_DOCUMENT" "$STORY_CREATE_RESULT" "$STORY_REOPEN_RESULT"

mkdir -p "$REPOSITORY_ROOT/artifacts/evidence"
CURATE_RESULT="$JOURNEY_ROOT/curate-journey-result.json"
CURATE_GATE_STATUS="$REPOSITORY_ROOT/artifacts/evidence/curate-gate-status.txt"
if [[ "${DW_REQUIRE_CURATE_JOURNEY:-0}" == "1" ]]; then
  test -s "$CURATE_RESULT"
  node "$REPOSITORY_ROOT/scripts/verify-curate-journey-output.mjs" \
    "$CURATE_RESULT" "$COMMIT_SHA" macos-arm64 app-zip 'extracted macOS app'
  printf 'verified\t%s\t%s\n' "$COMMIT_SHA" 'extracted macOS app' > "$CURATE_GATE_STATUS"
else
  printf 'unverified\t%s\n' \
    'native packaged Curate tracer has not emitted curate-journey-result.json' \
    > "$CURATE_GATE_STATUS"
  echo 'WB-F02 packaged Curate journey: UNVERIFIED — native tracer output hook is inactive'
fi
cp "$CREATE_RESULT" "$REPOSITORY_ROOT/artifacts/evidence/create-result.json"
cp "$REOPEN_RESULT" "$REPOSITORY_ROOT/artifacts/evidence/reopen-result.json"
cp "$STORY_CREATE_RESULT" "$REPOSITORY_ROOT/artifacts/evidence/story-create-result.json"
cp "$STORY_REOPEN_RESULT" "$REPOSITORY_ROOT/artifacts/evidence/story-reopen-result.json"
cp "$PDF" "$REPOSITORY_ROOT/artifacts/evidence/tracer.pdf"
(
  cd "$REPOSITORY_ROOT/artifacts/evidence"
  shasum -a 256 tracer.pdf > tracer.pdf.sha256
)

echo "DW-T00 packaged verification passed at $COMMIT_SHA"
