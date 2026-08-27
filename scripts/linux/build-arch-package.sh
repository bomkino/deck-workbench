#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
SOURCE_DATE_EPOCH="$(git -C "$REPOSITORY_ROOT" show -s --format=%ct "$COMMIT_SHA")"
SHORT_SHA="${COMMIT_SHA:0:12}"
PACKAGE_VERSION="0.0.0.r${SHORT_SHA}"
BUNDLE="${1:-$REPOSITORY_ROOT/build/linux-x64/Deck-Workbench-linux-x64}"
PACKAGE_ROOT="$REPOSITORY_ROOT/build/arch-package-root"
ARTIFACT_ROOT="$REPOSITORY_ROOT/artifacts"
ARCHIVE="$ARTIFACT_ROOT/deck-workbench-${PACKAGE_VERSION}-1-x86_64.pkg.tar.zst"

if [[ ! -x "$BUNDLE/deck-workbench" ]]; then
  echo "PackageGate: built Linux x86_64 bundle is required" >&2
  exit 2
fi

if ! git -C "$REPOSITORY_ROOT" diff --quiet --exit-code \
  || ! git -C "$REPOSITORY_ROOT" diff --cached --quiet --exit-code \
  || [[ -n "$(git -C "$REPOSITORY_ROOT" ls-files --others --exclude-standard)" ]]; then
  echo "SourceGate: exact-SHA Arch packaging requires a clean working tree" >&2
  exit 2
fi

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

if ! command -v zstd >/dev/null; then
  echo "DependencyGate: zstd is required for the Arch package" >&2
  exit 2
fi

rm -rf "$PACKAGE_ROOT"
mkdir -p "$PACKAGE_ROOT/opt" "$PACKAGE_ROOT/usr/bin" "$PACKAGE_ROOT/usr/share/applications" "$ARTIFACT_ROOT"
cp -a "$BUNDLE" "$PACKAGE_ROOT/opt/deck-workbench"
ln -s ../../opt/deck-workbench/deck-workbench "$PACKAGE_ROOT/usr/bin/deck-workbench"
cp scripts/linux/deck-workbench.desktop "$PACKAGE_ROOT/usr/share/applications/deck-workbench.desktop"

PACKAGE_SIZE="$(du -sb "$PACKAGE_ROOT/opt/deck-workbench" "$PACKAGE_ROOT/usr" | awk '{ total += $1 } END { print total }')"
node --input-type=module - "$PACKAGE_ROOT/.PKGINFO" "$PACKAGE_VERSION" "$SOURCE_DATE_EPOCH" "$PACKAGE_SIZE" <<'NODE'
import { writeFileSync } from 'node:fs'

const [, , output, version, buildDate, installedSize] = process.argv
writeFileSync(output, `pkgname = deck-workbench
pkgbase = deck-workbench
pkgver = ${version}-1
pkgdesc = Semantic presentation workbench Linux tracer
url = https://github.com/bomkino/deck-workbench
builddate = ${buildDate}
packager = Deck Workbench CI
size = ${installedSize}
arch = x86_64
license = AGPL-3.0-only
depend = glibc
depend = gtk3
depend = nss
depend = alsa-lib
depend = libxss
depend = libdrm
depend = mesa
`)
NODE

rm -f "$ARCHIVE" "$ARCHIVE.sha256"
tar \
  --sort=name \
  --mtime="@$SOURCE_DATE_EPOCH" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --zstd \
  -C "$PACKAGE_ROOT" \
  -cf "$ARCHIVE" \
  .PKGINFO opt usr

(
  cd "$ARTIFACT_ROOT"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)

echo "$ARCHIVE"
