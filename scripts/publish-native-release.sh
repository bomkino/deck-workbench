#!/bin/bash
set -euo pipefail
TAG="${1:?Pass an existing vX.Y.Z tag}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version tag' >&2; exit 1; }
SHA="$(git rev-parse HEAD)"
test "$(git rev-parse "$TAG^{commit}")" = "$SHA"
git fetch origin main --no-tags
git merge-base --is-ancestor "$SHA" origin/main
VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
test "$TAG" = "v$VERSION"
if gh release view "$TAG" >/dev/null 2>&1; then
  echo 'This version is already published; do not overwrite a release.' >&2; exit 1
fi
TEMP="$(mktemp -d)"; trap 'rm -rf "$TEMP"' EXIT
NAME="native-mac-$SHA"
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?name=$NAME&per_page=100" > "$TEMP/artifacts.json"
ID="$(python3 - "$TEMP/artifacts.json" "$NAME" <<'PYART'
import json, sys
rows = [a for a in json.load(open(sys.argv[1]))['artifacts'] if not a['expired'] and a['name']==sys.argv[2] and a.get('workflow_run',{}).get('head_branch') in ['main','codex/native-workflow-fixes']]
if not rows: raise SystemExit('No matching native build artifact. Build this source before tagging.')
print(rows[0]['id'])
PYART
)"
RUN="$(gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$ID" --jq .workflow_run.id)"
test "$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$RUN" --jq .conclusion)" = success
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$ID/zip" > "$TEMP/artifact.zip"
unzip -q "$TEMP/artifact.zip" -d "$TEMP/contents"
ZIP="$(find "$TEMP/contents" -name "Deck-Workbench-apple-silicon-$SHA.app.zip" -type f -print -quit)"
RECEIPT="$(find "$TEMP/contents" -name native-acceptance.json -type f -print -quit)"
test -n "$ZIP"; test -n "$RECEIPT"
(cd "$(dirname "$ZIP")"; shasum -a 256 -c "$(basename "$ZIP").sha256")
python3 - "$RECEIPT" "$SHA" "$VERSION" <<'PYRECEIPT'
import json, sys
r=json.load(open(sys.argv[1]))
assert r['commit']==sys.argv[2] and r['version']==sys.argv[3]
for name in ['copyComplete','previewScope','shortlistIndependent','reopen','savedCopyRecovery','uiIndependentPDF','nativeKeyEvents','layoutPicker','perImageEdits','notesUndo','validationDoesNotFence','copyOnlyIndependent','literalCopy','safeFilenames','thumbnailCache']:
    assert r.get(name) is True, name
assert r['prototypePages']==20 and r['rapidDecisions']==40 and r['originalCopies']>=60
PYRECEIPT
ditto -x -k "$ZIP" "$TEMP/extracted"
APP="$TEMP/extracted/Deck Workbench.app"
codesign --verify --deep --strict "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :DeckWorkbenchCommit' "$APP/Contents/Info.plist")" = "$SHA"
gh release create "$TAG" "$ZIP" "$ZIP.sha256" "$RECEIPT"   --target "$SHA" --title "Deck Workbench $TAG — Native Mac workflow repair"   --notes-file docs/RELEASE_NOTES.md --latest
