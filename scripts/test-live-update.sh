#!/bin/bash
# Proves a new release's update feed with a real copy of the app before the
# release becomes Latest. The release workflow publishes vX.Y.Z without making
# it Latest and then runs this: it downloads the current Latest release (what
# installed copies run), opens it with STUDIO_UPDATE_TEST=1 (check at once,
# install as soon as ready) and STUDIO_UPDATE_FEED set to the new release's own
# appcast.xml, waits for its files to become the new version, then for the new
# version to start as a new process and say it is running. Only after that does
# the workflow mark the release Latest, which is when every installed copy
# reads that feed (docs/UPDATES.md).
#
#   bash scripts/test-live-update.sh vX.Y.Z [feed URL]
#
# The feed defaults to https://github.com/<repo>/releases/download/vX.Y.Z/appcast.xml.
# Needs the GitHub CLI (GH_TOKEN in CI); the app itself is started without
# GH_TOKEN or GITHUB_TOKEN. Skipped, successfully, only when there is nothing
# to update from: a Latest release from before the updater (0.4.0 and
# earlier), or one that is not older than vX.Y.Z (the workflow never makes such
# a release Latest). Not being able to read or download the Latest release is
# a failure, never a skip.
set -euo pipefail
TAG="${1:?Pass the vX.Y.Z release to update to}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid version tag' >&2; exit 1; }
REPO="${GITHUB_REPOSITORY:-bomkino/deck-workbench}"
FEED="${2:-https://github.com/$REPO/releases/download/$TAG/appcast.xml}"
WANT="${TAG#v}"
BUNDLE="Deck Workbench"
EXE="DeckWorkbench"
ID="dog.pitch.deck-workbench"
build() { echo "$1" | awk -F. '{ printf "%d", $1 * 10000 + $2 * 100 + $3 }'; }
WORK="$(mktemp -d)"
APP_PID=""
# The old copy runs under the real app's bundle identifier, so what it saves
# lands in the real app's defaults: STUDIO_UPDATE_TEST turns on Sparkle's
# SUAutomaticallyUpdate, Sparkle records its check, and the test sets
# UpdateTestReadyFile. Where nothing was saved before (a CI runner) all of it
# is removed again; on a Mac that already runs Workbench only the test's own
# changes are put back.
HAD_DEFAULTS=false
defaults read "$ID" >/dev/null 2>&1 && HAD_DEFAULTS=true
PRIOR_AUTOMATIC="$(defaults read "$ID" SUAutomaticallyUpdate 2>/dev/null || true)"
cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  pkill -f "$WORK/install/$BUNDLE.app/Contents/MacOS/$EXE" 2>/dev/null || true
  for _ in $(seq 10); do
    pgrep -f "$WORK/install/$BUNDLE.app/Contents/MacOS/$EXE" >/dev/null 2>&1 || break
    sleep 0.5
  done
  if [ "$HAD_DEFAULTS" = false ]; then
    defaults delete "$ID" 2>/dev/null || true
  else
    defaults delete "$ID" UpdateTestReadyFile 2>/dev/null || true
    case "$PRIOR_AUTOMATIC" in
      1) defaults write "$ID" SUAutomaticallyUpdate -bool true ;;
      0) defaults write "$ID" SUAutomaticallyUpdate -bool false ;;
      *) defaults delete "$ID" SUAutomaticallyUpdate 2>/dev/null || true ;;
    esac
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# The new release must already be downloadable (published, not a draft).
offers() { grep -Eq "shortVersionString(>|=\")${WANT}[<\"]" <<< "$(curl -fsSL "$FEED" || true)"; }
for _ in $(seq 24); do
  offers && break
  sleep 5
done
offers || { echo "live update: FAILED, $FEED doesn't offer $WANT"; exit 1; }
echo "live update: $FEED offers $WANT"

FROM="$(gh api "repos/$REPO/releases/latest" --jq .tag_name)" && [ -n "$FROM" ] \
  || { echo "live update: FAILED, couldn't read the Latest release"; exit 1; }
[ "$FROM" != "$TAG" ] || { echo "live update: FAILED, $TAG is already Latest; this test runs before a release becomes Latest"; exit 1; }
if [ "$(build "${FROM#v}")" -ge "$(build "$WANT")" ]; then
  echo "live update: skipped, Latest $FROM is not older than $TAG, so $TAG does not become Latest"; exit 0
fi
gh release download "$FROM" -R "$REPO" -p 'Deck-Workbench-apple-silicon-*.app.zip' -D "$WORK" \
  || { echo "live update: FAILED, couldn't download $FROM's app ZIP"; exit 1; }
mkdir -p "$WORK/install" && ditto -x -k "$WORK"/Deck-Workbench-apple-silicon-*.app.zip "$WORK/install"
APP="$WORK/install/$BUNDLE.app"
if [ ! -d "$APP/Contents/Frameworks/Sparkle.framework" ]; then
  echo "live update: skipped, $FROM came before the updater"; exit 0
fi
version() { /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist"; }
echo "live update: opening $BUNDLE $(version) ($FROM, the Latest release) against $FEED"
# The new version writes "version process" here once it is up (read from its
# defaults, which a relaunch keeps).
READY="$WORK/ready"
defaults write "$ID" UpdateTestReadyFile "$READY"
# The app never needs, and must never see, the workflow's GitHub token.
env -u GH_TOKEN -u GITHUB_TOKEN STUDIO_UPDATE_TEST=1 STUDIO_UPDATE_FEED="$FEED" \
  "$APP/Contents/MacOS/$EXE" > "$WORK/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 180); do
  [ "$(version)" = "$WANT" ] && break
  sleep 1
done
got="$(version)"
if [ "$got" != "$WANT" ]; then
  echo "live update: FAILED, $FROM is still $got"; cat "$WORK/app.log"; exit 1
fi
codesign --verify --deep --strict "$APP"
NEW=""
for _ in $(seq 60); do
  if read -r v pid < "$READY" 2>/dev/null && [ "$v" = "$WANT" ] && [ "$pid" != "$APP_PID" ]; then NEW="$pid"; break; fi
  sleep 1
done
[ -n "$NEW" ] || { echo "live update: FAILED, $WANT is on disk but never said it was running"; cat "$WORK/app.log"; exit 1; }
sleep 3
kill -0 "$NEW" 2>/dev/null || { echo "live update: FAILED, $WANT started (process $NEW) but stopped within three seconds"; exit 1; }
kill "$NEW" 2>/dev/null || true
echo "live update: $FROM updated itself to $WANT from $FEED, and $WANT relaunched (process $NEW) and is running"
