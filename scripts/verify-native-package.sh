#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
ZIP="$ROOT/artifacts/Deck-Workbench-apple-silicon-$SHA.app.zip"
EXTRACT="$(mktemp -d)"
trap 'rm -rf "$EXTRACT"' EXIT
(cd "$ROOT/artifacts"; shasum -a 256 -c "$(basename "$ZIP").sha256")
ditto -x -k "$ZIP" "$EXTRACT"
APP="$EXTRACT/Deck Workbench.app"
codesign --verify --deep --strict "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :DeckWorkbenchCommit' "$APP/Contents/Info.plist")" = "$SHA"
test "$(lipo -archs "$APP/Contents/MacOS/DeckWorkbench")" = arm64
"$APP/Contents/MacOS/DeckWorkbench" --native-self-test "$ROOT/artifacts/evidence"
node - "$ROOT/artifacts/evidence/native-acceptance.json" "$SHA" <<'NODE'
const fs = require('node:fs')
const receipt = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (receipt.commit !== process.argv[3]) throw new Error('Acceptance commit does not match package')
for (const field of ['copyComplete', 'previewScope', 'shortlistIndependent', 'reopen', 'savedCopyRecovery', 'uiIndependentPDF', 'nativeKeyEvents', 'layoutPicker', 'perImageEdits', 'notesUndo', 'validationDoesNotFence', 'copyOnlyIndependent', 'literalCopy', 'safeFilenames', 'thumbnailCache']) {
  if (receipt[field] !== true) throw new Error('Failed packaged acceptance: ' + field)
}
if (receipt.prototypePages !== 20 || receipt.rapidDecisions !== 40 || receipt.originalCopies < 60) throw new Error('Incomplete handoff acceptance')
NODE
