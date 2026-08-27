#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
SOURCE_DATE_EPOCH="$(git -C "$REPOSITORY_ROOT" show -s --format=%ct "$COMMIT_SHA")"
SHORT_SHA="${COMMIT_SHA:0:12}"
BUNDLE="${1:-$REPOSITORY_ROOT/build/linux-x64/Deck-Workbench-linux-x64}"
APPDIR="$REPOSITORY_ROOT/build/linux-x64/Deck-Workbench.AppDir"
TOOLS_ROOT="$REPOSITORY_ROOT/build/appimage-tools"
APPIMAGETOOL="$TOOLS_ROOT/appimagetool-x86_64.AppImage"
RUNTIME="$TOOLS_ROOT/runtime-x86_64"
ARTIFACT_ROOT="$REPOSITORY_ROOT/artifacts"
APPIMAGE="$ARTIFACT_ROOT/Deck-Workbench-0.0.0.r${SHORT_SHA}-x86_64.AppImage"
REPRODUCIBILITY_COPY="$REPOSITORY_ROOT/build/linux-x64/Deck-Workbench-reproducibility-check.AppImage"

APPIMAGETOOL_SHA256="ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
RUNTIME_SHA256="2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"

if [[ ! -x "$BUNDLE/deck-workbench" ]]; then
  echo "PackageGate: built Linux x86_64 bundle is required" >&2
  exit 2
fi

if ! git -C "$REPOSITORY_ROOT" diff --quiet --exit-code \
  || ! git -C "$REPOSITORY_ROOT" diff --cached --quiet --exit-code \
  || [[ -n "$(git -C "$REPOSITORY_ROOT" ls-files --others --exclude-standard)" ]]; then
  echo "SourceGate: exact-SHA AppImage packaging requires a clean working tree" >&2
  exit 2
fi

for input in "$APPIMAGETOOL" "$RUNTIME"; do
  if [[ ! -x "$input" ]]; then
    echo "DependencyGate: run scripts/linux/fetch-appimage-tools.sh first" >&2
    exit 2
  fi
done

printf '%s  %s\n' "$APPIMAGETOOL_SHA256" "$APPIMAGETOOL" | sha256sum -c
printf '%s  %s\n' "$RUNTIME_SHA256" "$RUNTIME" | sha256sum -c

BUNDLE_COMMIT="$(node --input-type=module - "$BUNDLE/resources/app/deck-workbench-build.json" <<'NODE'
import { readFileSync } from 'node:fs'
const [, , path] = process.argv
process.stdout.write(JSON.parse(readFileSync(path, 'utf8')).commit ?? '')
NODE
)"
if [[ "$BUNDLE_COMMIT" != "$COMMIT_SHA" ]]; then
  echo "PackageGate: Linux bundle commit does not match source HEAD" >&2
  exit 2
fi

rm -rf "$APPDIR"
mkdir -p \
  "$APPDIR/usr/lib" \
  "$APPDIR/usr/bin" \
  "$APPDIR/usr/share/applications" \
  "$APPDIR/usr/share/icons/hicolor/scalable/apps" \
  "$ARTIFACT_ROOT"

cp -a "$BUNDLE" "$APPDIR/usr/lib/deck-workbench"
ln -s ../lib/deck-workbench/deck-workbench "$APPDIR/usr/bin/deck-workbench"
cp "$REPOSITORY_ROOT/scripts/linux/AppRun" "$APPDIR/AppRun"
cp "$REPOSITORY_ROOT/scripts/linux/deck-workbench-appimage.desktop" "$APPDIR/deck-workbench.desktop"
cp "$REPOSITORY_ROOT/scripts/linux/deck-workbench.svg" "$APPDIR/deck-workbench.svg"
cp "$REPOSITORY_ROOT/scripts/linux/deck-workbench-appimage.desktop" "$APPDIR/usr/share/applications/deck-workbench.desktop"
cp "$REPOSITORY_ROOT/scripts/linux/deck-workbench.svg" "$APPDIR/usr/share/icons/hicolor/scalable/apps/deck-workbench.svg"
cp "$REPOSITORY_ROOT/scripts/linux/legal/appimage-type2-runtime-LICENSE" \
  "$APPDIR/usr/lib/deck-workbench/resources/app/legal/AppImage-type2-runtime-LICENSE"
chmod 0755 "$APPDIR/AppRun"

# Clamp every AppDir timestamp before mksquashfs sees it. SOURCE_DATE_EPOCH is
# the exact source commit time, not the wall clock of the CI worker.
find "$APPDIR" -exec touch -h --date="@$SOURCE_DATE_EPOCH" {} +

build_appimage() {
  local output="$1"
  rm -f "$output"
  ARCH=x86_64 \
    VERSION="0.0.0.r${SHORT_SHA}" \
    SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" \
    APPIMAGE_EXTRACT_AND_RUN=1 \
    "$APPIMAGETOOL" \
      --no-appstream \
      --runtime-file "$RUNTIME" \
      "$APPDIR" \
      "$output"
  chmod 0755 "$output"
}

build_appimage "$APPIMAGE"
build_appimage "$REPRODUCIBILITY_COPY"
if ! cmp --silent "$APPIMAGE" "$REPRODUCIBILITY_COPY"; then
  echo "ReproducibilityGate: repeated AppImage builds differ" >&2
  exit 1
fi
rm -f "$REPRODUCIBILITY_COPY"

(
  cd "$ARTIFACT_ROOT"
  sha256sum "$(basename "$APPIMAGE")" > "$(basename "$APPIMAGE").sha256"
)

echo "$APPIMAGE"
