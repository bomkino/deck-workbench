#!/bin/bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
ZIP="${1:-$REPOSITORY_ROOT/artifacts/Deck-Workbench-apple-silicon-${COMMIT_SHA}.app.zip}"
EXTRACT_ROOT="$(mktemp -d)"
JOURNEY_ROOT="$(mktemp -d)"
trap 'rm -rf "$EXTRACT_ROOT" "$JOURNEY_ROOT"' EXIT

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "NativeGate: packaged verification requires Apple-Silicon macOS" >&2
  exit 2
fi

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
test "$(wc -l < "$STORY_DOCUMENT/journal.ndjson" | tr -d ' ')" = "16"

"$BINARY" --tracer-story-reopen "$STORY_DOCUMENT" "$STORY_CREATE_RESULT" "$STORY_REOPEN_RESULT"
test "$(wc -l < "$STORY_DOCUMENT/journal.ndjson" | tr -d ' ')" = "24"
node "$REPOSITORY_ROOT/scripts/verify-story-tracer-output.mjs" \
  "$STORY_DOCUMENT" "$STORY_CREATE_RESULT" "$STORY_REOPEN_RESULT"

mkdir -p "$REPOSITORY_ROOT/artifacts/evidence"
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
