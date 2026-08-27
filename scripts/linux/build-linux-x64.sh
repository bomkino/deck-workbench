#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_ROOT="$REPOSITORY_ROOT/build/linux-x64"
BUNDLE_NAME="Deck-Workbench-linux-x64"
BUNDLE="$BUILD_ROOT/$BUNDLE_NAME"
ARTIFACT_ROOT="$REPOSITORY_ROOT/artifacts"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
SOURCE_DATE_EPOCH="$(git -C "$REPOSITORY_ROOT" show -s --format=%ct "$COMMIT_SHA")"
ELECTRON_DIST="$REPOSITORY_ROOT/node_modules/electron/dist"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "NativeGate: Linux is required" >&2
  exit 2
fi

case "$(uname -m)" in
  x86_64|amd64) ;;
  *)
    echo "NativeGate: an x86_64 Linux host is required" >&2
    exit 2
    ;;
esac

if [[ ! -x "$ELECTRON_DIST/electron" ]]; then
  echo "DependencyGate: run npm ci && npm run install:electron to install the pinned Electron runtime" >&2
  exit 2
fi

if [[ ! -f "$REPOSITORY_ROOT/apps/linux/main.mjs" ]]; then
  echo "SourceGate: apps/linux/main.mjs is required" >&2
  exit 2
fi

cd "$REPOSITORY_ROOT"
npm run generate

if ! git diff --quiet --exit-code \
  || ! git diff --cached --quiet --exit-code \
  || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "SourceGate: exact-SHA Linux packaging requires a clean working tree" >&2
  git status --short >&2
  exit 2
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$BUNDLE" "$BUNDLE/resources/app/apps" "$BUNDLE/resources/app/build" "$BUNDLE/resources/app/legal" "$ARTIFACT_ROOT"

cp -a "$ELECTRON_DIST/." "$BUNDLE/"
mv "$BUNDLE/electron" "$BUNDLE/deck-workbench"
rm -f "$BUNDLE/resources/default_app.asar"

cp -R apps/linux "$BUNDLE/resources/app/apps/linux"
mkdir -p "$BUNDLE/resources/app/apps/macos/Resources"
cp -R apps/macos/Resources/Workspace "$BUNDLE/resources/app/apps/macos/Resources/Workspace"
cp -R packages "$BUNDLE/resources/app/packages"
cp -R build/generated "$BUNDLE/resources/app/build/generated"
cp scripts/linux/runtime-package.json "$BUNDLE/resources/app/package.json"
cp LICENSE NOTICE THIRD_PARTY.md "$BUNDLE/resources/app/legal/"

node --input-type=module - "$BUNDLE/resources/app/deck-workbench-build.json" "$COMMIT_SHA" <<'NODE'
import { writeFileSync } from 'node:fs'

const [, , output, commit] = process.argv
writeFileSync(output, `${JSON.stringify({
  repository: 'bomkino/deck-workbench',
  commit,
  platform: 'linux',
  architecture: 'x86_64',
  electron: '44.0.0',
}, null, 2)}\n`)
NODE

chmod 0755 "$BUNDLE/deck-workbench"

ARCHIVE="$ARTIFACT_ROOT/Deck-Workbench-linux-x64-${COMMIT_SHA}.tar.gz"
rm -f "$ARCHIVE" "$ARCHIVE.sha256"
tar \
  --sort=name \
  --mtime="@$SOURCE_DATE_EPOCH" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C "$BUILD_ROOT" \
  -czf "$ARCHIVE" \
  "$BUNDLE_NAME"

(
  cd "$ARTIFACT_ROOT"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)

scripts/linux/build-arch-package.sh "$BUNDLE"
scripts/linux/build-appimage.sh "$BUNDLE"

echo "$ARCHIVE"
