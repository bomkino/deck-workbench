#!/bin/bash
# Publishes one version from the exact successful CI artifact of its tag's
# commit, never rebuilding it. The release workflow runs this from main around
# scripts/sign-release.sh, so the update key exists only while the feed is
# signed, and around scripts/test-live-update.sh, so installed copies are only
# pointed at a release whose feed has updated a real copy (docs/UPDATES.md):
#
#   scripts/publish-native-release.sh stage vX.Y.Z <dir>    # find, check and unpack the artifact
#   scripts/sign-release.sh <dir> <dir>/update-notes.md      # with the key: writes <dir>/appcast.xml
#   scripts/publish-native-release.sh publish vX.Y.Z <dir>  # the release, with the signed feed, not Latest
#   scripts/test-live-update.sh vX.Y.Z                       # the Latest release updates itself from it
#   scripts/publish-native-release.sh promote vX.Y.Z        # only then: mark it Latest
set -euo pipefail
MODE="${1:?Pass stage, publish or promote}"
TAG="${2:?Pass the vX.Y.Z tag to publish (the release workflow creates it from main if missing)}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version tag' >&2; exit 1; }
REPO="${GITHUB_REPOSITORY:-bomkino/deck-workbench}"
PUBLIC_KEY="P43E8I+FgVyAW3QkS4J9bnDRRhAnsS4y3dT2WDce1lQ="
FEED="https://github.com/$REPO/releases/latest/download/appcast.xml"
build() { echo "$1" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }'; }
offers() { grep -Eq "shortVersionString(>|=\")$2[<\"]" <<< "$(curl -fsSL "$1" || true)"; }

if [ "$MODE" = promote ]; then
  VERSION="${TAG#v}"
  # Only the highest version becomes Latest, which is the release whose feed
  # installed copies read; publishing an older patch never rolls them back.
  # Read first, so a failed listing stops here instead of looking empty.
  TAGS="$(gh release list -R "$REPO" --exclude-drafts --exclude-pre-releases --limit 200 --json tagName --jq '.[].tagName')"
  HIGHEST=0
  for tag in $TAGS; do
    [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && [ "$tag" != "$TAG" ] || continue
    [ "$(build "${tag#v}")" -le "$HIGHEST" ] || HIGHEST="$(build "${tag#v}")"
  done
  if [ "$(build "$VERSION")" -le "$HIGHEST" ]; then
    echo "$TAG stays published but not Latest: a higher version is already out, so installed copies keep its feed."
    exit 0
  fi
  gh release edit "$TAG" -R "$REPO" --latest
  for _ in $(seq 24); do
    if offers "$FEED" "$VERSION"; then
      echo "$TAG is Latest and the feed offers $VERSION: installed copies will update to it."
      exit 0
    fi
    sleep 5
  done
  echo "$TAG is marked Latest, but releases/latest/download/appcast.xml doesn't offer $VERSION" >&2; exit 1
fi

OUT="${3:?Pass a working folder}"
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
  for file in "$ZIP" "$ZIP.sha256" native-acceptance.json appcast.xml release-notes.md release-title.txt; do test -s "$OUT/$file"; done
  (cd "$OUT"; shasum -a 256 -c "$ZIP.sha256")
  grep -Eq "shortVersionString(>|=\")$VERSION[<\"]" "$OUT/appcast.xml"
  grep -q "url=\"https://github.com/$REPO/releases/download/$TAG/$ZIP\"" "$OUT/appcast.xml"
  grep -q 'sparkle:edSignature="' "$OUT/appcast.xml"
  TITLE="$(cat "$OUT/release-title.txt")"
  # Published, so its files can be downloaded, but not Latest: installed copies
  # keep reading the Latest release's feed until scripts/test-live-update.sh
  # has updated a real copy from this release's own feed and promote runs.
  gh release create "$TAG" "$OUT/$ZIP" "$OUT/$ZIP.sha256" "$OUT/native-acceptance.json" "$OUT/appcast.xml" -R "$REPO" \
    --target "$SHA" --title "$TITLE" --notes-file "$OUT/release-notes.md" --latest=false
  # The page as GitHub shows it: this version's notes only, with how to install.
  gh api "repos/$REPO/releases/tags/$TAG" > "$OUT/published.json"
  python3 - "$OUT/published.json" "$TITLE" <<'PYPUBLISHED'
import json, re, sys
release = json.load(open(sys.argv[1], encoding='utf-8'))
body = (release.get('body') or '').replace('\r\n', '\n')
headings = [line for line in body.split('\n') if re.match(r'# v[0-9]', line)]
problems = []
if release.get('name') != sys.argv[2]:
    problems.append('its title is %r, not %r' % (release.get('name'), sys.argv[2]))
if '**Install:**' not in body:
    problems.append('its notes have no **Install:** line')
if len(headings) > 1:
    problems.append('its notes hold %d version headings (%s) instead of one version' % (len(headings), ', '.join(headings)))
if release.get('draft') or release.get('prerelease'):
    problems.append('it is a draft or pre-release, so installed copies could not download it')
if problems:
    print('The published release is wrong: ' + '; '.join(problems) + '. It is not Latest; fix it on GitHub, '
          'or delete the release and its tag, before running the workflow again.', file=sys.stderr)
    raise SystemExit(1)
if headings:
    print('warning: the release notes still carry the heading ' + headings[0])
PYPUBLISHED
  echo "Published $TAG as \"$TITLE\", not yet Latest."
  exit 0
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
test -n "$ID" || { echo 'No successful exact-source native build artifact is available (CI artifacts expire after 90 days).' >&2; exit 1; }
gh api "repos/$REPO/actions/artifacts/$ID/zip" > "$TEMP/artifact.zip"
unzip -q "$TEMP/artifact.zip" -d "$TEMP/contents"
FOUND="$(find "$TEMP/contents" -name "$ZIP" -type f -print -quit)"
RECEIPT="$(find "$TEMP/contents" -name native-acceptance.json -type f -print -quit)"
test -n "$FOUND"; test -n "$RECEIPT"
(cd "$(dirname "$FOUND")"; shasum -a 256 -c "$ZIP.sha256")
# The same acceptance rule every build passed in scripts/verify-native-package.sh.
python3 "$(dirname "$0")/check-native-acceptance.py" "$RECEIPT" "$SHA" "$VERSION"
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
# The update window and the release page show this version's section of the
# notes; the release page adds how to install and a link to every version.
git show "$SHA:docs/RELEASE_NOTES.md" | awk -v v="v$VERSION" '$1 == "#" && $2 ~ /^v[0-9]/ { on = ($2 == v) } on' > "$OUT/update-notes.md"
test -s "$OUT/update-notes.md" || { echo "docs/RELEASE_NOTES.md has no section for v$VERSION" >&2; exit 1; }
# "# vX.Y.Z — Subtitle" titles the release "Deck Workbench vX.Y.Z — Subtitle";
# a bare "# vX.Y.Z" titles it "Deck Workbench vX.Y.Z".
python3 - "$OUT/update-notes.md" "$TAG" > "$OUT/release-title.txt" <<'PYTITLE'
import re, sys
tag = sys.argv[2]
with open(sys.argv[1], encoding='utf-8') as handle:
    heading = handle.readline().strip()
match = re.match(r'#\s+' + re.escape(tag) + r'(?:\s+[—–-]\s*(.*))?$', heading)
if not match:
    raise SystemExit('docs/RELEASE_NOTES.md: the heading %r should read "# %s — Subtitle"' % (heading, tag))
subtitle = (match.group(1) or '').strip()
print('Deck Workbench ' + tag + (' — ' + subtitle if subtitle else ''))
PYTITLE
{
  tail -n +2 "$OUT/update-notes.md" | sed '/./,$!d'
  printf '\n---\n\n**Install:** download the `.app.zip` below, unzip it and move **Deck Workbench** into Applications (Apple Silicon, macOS 26 or later). The app isn'"'"'t notarized, so the first time you open it macOS says it could not verify it is free of malware: click **Done**, open **System Settings → Privacy & Security**, click **Open Anyway** beside Deck Workbench and confirm. If macOS ever says the app will damage your computer, delete it. Copies from v0.5.0 on update themselves through **Deck Workbench › Check for Updates…**.\n\n[All release notes](https://github.com/%s/blob/%s/docs/RELEASE_NOTES.md)\n' "$REPO" "$TAG"
} > "$OUT/release-notes.md"
# One version's notes, never the whole file.
if grep -Eq '^# v[0-9]' "$OUT/release-notes.md"; then
  echo "The release notes for $TAG carry a version heading; check docs/RELEASE_NOTES.md" >&2; exit 1
fi
grep -qF '**Install:**' "$OUT/release-notes.md"
echo "Staged $TAG ($SHA) as \"$(cat "$OUT/release-title.txt")\" in $OUT"
