#!/bin/bash
# Publishes one version from the exact successful CI artifact of its tag's
# commit, never rebuilding it. The release workflow runs this from main in two
# steps around scripts/sign-release.sh, so the update key exists only while
# the feed is signed (docs/UPDATES.md):
#
#   scripts/publish-native-release.sh stage vX.Y.Z <dir>    # find, check and unpack the artifact
#   scripts/sign-release.sh <dir> <dir>/update-notes.md      # with the key: writes <dir>/appcast.xml
#   scripts/publish-native-release.sh publish vX.Y.Z <dir>  # the release, with the signed feed
set -euo pipefail
MODE="${1:?Pass stage or publish}"
TAG="${2:?Pass an existing vX.Y.Z tag}"
OUT="${3:?Pass a working folder}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version tag' >&2; exit 1; }
REPO="${GITHUB_REPOSITORY:-bomkino/deck-workbench}"
PUBLIC_KEY="P43E8I+FgVyAW3QkS4J9bnDRRhAnsS4y3dT2WDce1lQ="
FEED="https://github.com/$REPO/releases/latest/download/appcast.xml"
build() { echo "$1" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }'; }
git fetch origin main --no-tags
SHA="$(git rev-parse "$TAG^{commit}")"
git merge-base --is-ancestor "$SHA" origin/main
VERSION="$(git show "$SHA:package.json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["version"])')"
test "$TAG" = "v$VERSION"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo 'This version is already published; do not overwrite a release.' >&2; exit 1
fi
ZIP="Deck-Workbench-apple-silicon-$SHA.app.zip"

if [ "$MODE" = publish ]; then
  for file in "$ZIP" "$ZIP.sha256" native-acceptance.json appcast.xml release-notes.md; do test -s "$OUT/$file"; done
  (cd "$OUT"; shasum -a 256 -c "$ZIP.sha256")
  grep -Eq "shortVersionString(>|=\")$VERSION[<\"]" "$OUT/appcast.xml"
  grep -q "url=\"https://github.com/$REPO/releases/download/$TAG/$ZIP\"" "$OUT/appcast.xml"
  grep -q 'sparkle:edSignature="' "$OUT/appcast.xml"
  # Only the highest version becomes Latest, which is the release whose feed
  # installed copies read; publishing an older patch never rolls them back.
  HIGHEST=0
  for tag in $(gh release list -R "$REPO" --exclude-drafts --exclude-pre-releases --limit 200 --json tagName --jq '.[].tagName'); do
    [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    [ "$(build "${tag#v}")" -le "$HIGHEST" ] || HIGHEST="$(build "${tag#v}")"
  done
  LATEST=false
  [ "$(build "$VERSION")" -le "$HIGHEST" ] || LATEST=true
  gh release create "$TAG" "$OUT/$ZIP" "$OUT/$ZIP.sha256" "$OUT/native-acceptance.json" "$OUT/appcast.xml" -R "$REPO" \
    --target "$SHA" --title "Deck Workbench $TAG" --notes-file "$OUT/release-notes.md" --latest="$LATEST"
  if [ "$LATEST" = false ]; then
    echo "Published $TAG without making it Latest: a higher version is already out, so installed copies keep its feed."
    exit 0
  fi
  for _ in $(seq 24); do
    if curl -fsSL "$FEED" | grep -Eq "shortVersionString(>|=\")$VERSION[<\"]"; then
      echo "The feed offers $VERSION: installed copies will update to it."
      exit 0
    fi
    sleep 5
  done
  echo "releases/latest/download/appcast.xml doesn't offer $VERSION" >&2; exit 1
fi

test "$MODE" = stage
TEMP="$(mktemp -d)"; trap 'rm -rf "$TEMP"' EXIT
NAME="native-mac-$SHA"
gh api "repos/$REPO/actions/artifacts?name=$NAME&per_page=100" > "$TEMP/artifacts.json"
ID=""
while IFS=' ' read -r CANDIDATE RUN; do
  test -n "$CANDIDATE" || continue
  if test -n "${RELEASE_ARTIFACT_ID:-}" && test "$CANDIDATE" != "$RELEASE_ARTIFACT_ID"; then continue; fi
  gh api "repos/$REPO/actions/runs/$RUN" > "$TEMP/run.json"
  if python3 - "$TEMP/run.json" "$SHA" "$REPO" <<'PYRUN'
import json, sys
r=json.load(open(sys.argv[1]))
valid = (r.get('conclusion') == 'success' and r.get('head_sha') == sys.argv[2]
         and r.get('event') == 'push' and r.get('path') == '.github/workflows/mac-native.yml'
         and r.get('head_repository',{}).get('full_name') == sys.argv[3]
         and (r.get('head_branch') == 'main' or r.get('head_branch','').startswith('codex/')))
raise SystemExit(0 if valid else 1)
PYRUN
  then ID="$CANDIDATE"; break; fi
done < <(python3 - "$TEMP/artifacts.json" "$NAME" "$SHA" <<'PYART'
import json, sys
for a in json.load(open(sys.argv[1]))['artifacts']:
    if not a['expired'] and a['name']==sys.argv[2] and a.get('workflow_run',{}).get('head_sha')==sys.argv[3]:
        print(a['id'], a['workflow_run']['id'])
PYART
)
test -n "$ID" || { echo 'No successful exact-source native build artifact is available.' >&2; exit 1; }
gh api "repos/$REPO/actions/artifacts/$ID/zip" > "$TEMP/artifact.zip"
unzip -q "$TEMP/artifact.zip" -d "$TEMP/contents"
FOUND="$(find "$TEMP/contents" -name "$ZIP" -type f -print -quit)"
RECEIPT="$(find "$TEMP/contents" -name native-acceptance.json -type f -print -quit)"
test -n "$FOUND"; test -n "$RECEIPT"
(cd "$(dirname "$FOUND")"; shasum -a 256 -c "$ZIP.sha256")
python3 - "$RECEIPT" "$SHA" "$VERSION" <<'PYRECEIPT'
import json, sys
r=json.load(open(sys.argv[1]))
assert r['commit']==sys.argv[2] and r['version']==sys.argv[3]
for name in ['copyComplete','previewScope','shortlistIndependent','reopen','savedCopyRecovery','uiIndependentPDF','nativeKeyEvents','layoutPicker','perImageEdits','notesUndo','validationDoesNotFence','copyOnlyIndependent','literalCopy','safeFilenames','thumbnailCache', 'slideManagement', 'copyEditorTarget', 'editedCopyHandoff','imageVisibleInPDF','layoutFrameCopy','layoutResetUndo','textLayoutReused','gradientScreenExportParity','visibleLayoutTargets','reviewNavigation','cropZoomUndo','notesTargetIdentity','catalogRevisionReuse','boundedImport','lifecycleSerialization','productionCopy','starterGridAndType','sharedPSDExport']:
    assert r.get(name) is True, name
assert r['prototypePages']==20 and r['rapidDecisions']==40 and r['originalCopies']>=60
PYRECEIPT
ditto -x -k "$FOUND" "$TEMP/extracted"
APP="$TEMP/extracted/Deck Workbench.app"
PLIST="$APP/Contents/Info.plist"
codesign --verify --deep --strict "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :DeckWorkbenchCommit' "$PLIST")" = "$SHA"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")" = "$VERSION"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")" = "$(build "$VERSION")"
# The app must trust pitch.dog's update key and read this repository's feed,
# or no later version could ever reach it.
test "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$PLIST")" = "$PUBLIC_KEY"
test "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$PLIST")" = "$FEED"
test -d "$APP/Contents/Frameworks/Sparkle.framework"
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$FOUND" "$FOUND.sha256" "$RECEIPT" "$OUT/"
git show "$SHA:docs/RELEASE_NOTES.md" > "$OUT/release-notes.md"
# The update window shows this version's section of the notes.
awk -v v="v$VERSION" '$1 == "#" && $2 ~ /^v[0-9]/ { on = ($2 == v) } on' "$OUT/release-notes.md" > "$OUT/update-notes.md"
test -s "$OUT/update-notes.md" || { echo "docs/RELEASE_NOTES.md has no section for v$VERSION" >&2; exit 1; }
echo "Staged $TAG ($SHA) in $OUT"
