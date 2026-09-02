#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMMIT_SHA="$(git -C "$REPOSITORY_ROOT" rev-parse HEAD)"
ARCHIVE="$REPOSITORY_ROOT/artifacts/Deck-Workbench-linux-x64-${COMMIT_SHA}.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
SHORT_SHA="${COMMIT_SHA:0:12}"
APP_VERSION="$(cd "$REPOSITORY_ROOT" && node -p "require('./package.json').version")"
ARCH_PACKAGE="$REPOSITORY_ROOT/artifacts/deck-workbench-${APP_VERSION}.r${SHORT_SHA}-1-x86_64.pkg.tar.zst"
ARCH_CHECKSUM="$ARCH_PACKAGE.sha256"
APPIMAGE="$REPOSITORY_ROOT/artifacts/Deck-Workbench-${APP_VERSION}.r${SHORT_SHA}-x86_64.AppImage"
APPIMAGE_CHECKSUM="$APPIMAGE.sha256"
EVIDENCE_ROOT="$REPOSITORY_ROOT/artifacts/evidence/linux"
EXTRACT_ROOT="$(mktemp -d)"
ARCHIVE_LIST="$EXTRACT_ROOT/archive-files.txt"
APP="$EXTRACT_ROOT/Deck-Workbench-linux-x64"
ARCH_EXTRACT_ROOT="$EXTRACT_ROOT/arch-package"
JOURNEY_ROOT="$EVIDENCE_ROOT/journey"
APPIMAGE_EXTRACT_ROOT="$EXTRACT_ROOT/appimage"
APPIMAGE_APP="$APPIMAGE_EXTRACT_ROOT/squashfs-root"
APPIMAGE_JOURNEY_ROOT="$EVIDENCE_ROOT/appimage-journey"

cleanup() {
  rm -rf "$EXTRACT_ROOT"
}
trap cleanup EXIT

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

for command in file node pdfinfo readlink sha256sum tar xvfb-run zstd; do
  if ! command -v "$command" >/dev/null; then
    echo "DependencyGate: $command is required" >&2
    exit 2
  fi
done

test -f "$ARCHIVE"
test -f "$CHECKSUM"
test -f "$ARCH_PACKAGE"
test -f "$ARCH_CHECKSUM"
test -x "$APPIMAGE"
test -f "$APPIMAGE_CHECKSUM"
rm -rf "$EVIDENCE_ROOT"
mkdir -p "$JOURNEY_ROOT" "$APPIMAGE_JOURNEY_ROOT"
(
  cd "$(dirname "$ARCHIVE")"
  sha256sum -c "$(basename "$CHECKSUM")"
  sha256sum -c "$(basename "$ARCH_CHECKSUM")"
  sha256sum -c "$(basename "$APPIMAGE_CHECKSUM")"
)

tar -tzf "$ARCHIVE" > "$ARCHIVE_LIST"
if awk 'BEGIN { bad = 0 } /^\// { bad = 1 } /(^|\/)\.\.($|\/)/ { bad = 1 } END { exit bad ? 0 : 1 }' "$ARCHIVE_LIST"; then
  echo "ArchiveGate: archive contains an unsafe path" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$EXTRACT_ROOT"
test -x "$APP/deck-workbench"
test -f "$APP/LICENSE"
test -f "$APP/LICENSES.chromium.html"
test -f "$APP/resources/app/legal/LICENSE"
test -f "$APP/resources/app/legal/THIRD_PARTY.md"
node "$REPOSITORY_ROOT/scripts/verify-workspace-type-assets.mjs" \
  "$APP/resources/app/build/generated/workspace" \
  "$APP/resources/app/legal"

tar --zstd -tf "$ARCH_PACKAGE" > "$EVIDENCE_ROOT/arch-package-files.txt"
if awk 'BEGIN { bad = 0 } /^\// { bad = 1 } /(^|\/)\.\.($|\/)/ { bad = 1 } END { exit bad ? 0 : 1 }' "$EVIDENCE_ROOT/arch-package-files.txt"; then
  echo "ArchiveGate: Arch package contains an unsafe path" >&2
  exit 1
fi
grep -Fx '.PKGINFO' "$EVIDENCE_ROOT/arch-package-files.txt"
grep -Fx 'opt/deck-workbench/deck-workbench' "$EVIDENCE_ROOT/arch-package-files.txt"
grep -Fx 'usr/bin/deck-workbench' "$EVIDENCE_ROOT/arch-package-files.txt"
grep -Fx 'usr/share/applications/deck-workbench.desktop' "$EVIDENCE_ROOT/arch-package-files.txt"
tar --zstd -xOf "$ARCH_PACKAGE" .PKGINFO > "$EVIDENCE_ROOT/arch-package-info.txt"
grep -Fx "pkgver = ${APP_VERSION}.r${SHORT_SHA}-1" "$EVIDENCE_ROOT/arch-package-info.txt"
grep -Fx 'arch = x86_64' "$EVIDENCE_ROOT/arch-package-info.txt"
mkdir -p "$ARCH_EXTRACT_ROOT"
tar --zstd -xf "$ARCH_PACKAGE" -C "$ARCH_EXTRACT_ROOT"
test -x "$ARCH_EXTRACT_ROOT/opt/deck-workbench/deck-workbench"
test -L "$ARCH_EXTRACT_ROOT/usr/bin/deck-workbench"
test "$(readlink "$ARCH_EXTRACT_ROOT/usr/bin/deck-workbench")" = '../../opt/deck-workbench/deck-workbench'
file "$ARCH_EXTRACT_ROOT/opt/deck-workbench/deck-workbench" | grep -Eq 'ELF 64-bit.*x86-64'
node "$REPOSITORY_ROOT/scripts/verify-workspace-type-assets.mjs" \
  "$ARCH_EXTRACT_ROOT/opt/deck-workbench/resources/app/build/generated/workspace" \
  "$ARCH_EXTRACT_ROOT/opt/deck-workbench/resources/app/legal"

file "$APP/deck-workbench" | tee "$EVIDENCE_ROOT/executable.txt"
grep -Eq 'ELF 64-bit.*x86-64' "$EVIDENCE_ROOT/executable.txt"

node --input-type=module - "$APP/resources/app/deck-workbench-build.json" "$COMMIT_SHA" <<'NODE'
import { readFileSync } from 'node:fs'

const [, , path, expectedCommit] = process.argv
const identity = JSON.parse(readFileSync(path, 'utf8'))
if (identity.repository !== 'bomkino/deck-workbench') throw new Error('Repository identity mismatch')
if (identity.commit !== expectedCommit) throw new Error(`Commit identity mismatch: ${identity.commit}`)
if (identity.platform !== 'linux' || identity.architecture !== 'x86_64') throw new Error('Platform identity mismatch')
if (identity.electron !== '44.0.0') throw new Error('Electron identity mismatch')
if (identity.version !== '0.0.5') throw new Error('Application version mismatch')
NODE

run_two_phase_journey() {
  local executable="$1"
  local output_root="$2"
  local config_root="$3"
  local extract_and_run="$4"
  local -a environment=(
    "ELECTRON_OZONE_PLATFORM_HINT=x11"
    "XDG_CONFIG_HOME=$config_root"
  )
  if [[ "$extract_and_run" == true ]]; then
    environment+=("APPIMAGE_EXTRACT_AND_RUN=1")
  fi

  mkdir -p "$output_root" "$config_root"
  env "${environment[@]}" \
    xvfb-run --auto-servernum --server-args='-screen 0 1440x900x24' \
    "$executable" --run-packaged-tracer-create "$output_root"
  test -s "$output_root/journey-create-result.json"
  test -s "$output_root/tracer.pitchdeck/manifest.json"

  env "${environment[@]}" \
    xvfb-run --auto-servernum --server-args='-screen 0 1440x900x24' \
    "$executable" --run-packaged-tracer-reopen "$output_root"
  test -s "$output_root/journey-result.json"
  test -s "$output_root/tracer.pdf"
}

run_two_phase_journey \
  "$APP/deck-workbench" \
  "$JOURNEY_ROOT" \
  "$EXTRACT_ROOT/tar-config" \
  false

test -s "$JOURNEY_ROOT/journey-result.json"
test -s "$JOURNEY_ROOT/tracer.pdf"
node scripts/linux/verify-linux-journey-result.mjs \
  "$JOURNEY_ROOT/journey-result.json" \
  'extracted Linux tarball'

pdfinfo "$JOURNEY_ROOT/tracer.pdf" | tee "$EVIDENCE_ROOT/pdfinfo.txt"
grep -Eq '^Pages:[[:space:]]+1$' "$EVIDENCE_ROOT/pdfinfo.txt"

file "$APPIMAGE" | tee "$EVIDENCE_ROOT/appimage-executable.txt"
grep -Eq 'ELF 64-bit.*x86-64' "$EVIDENCE_ROOT/appimage-executable.txt"

mkdir -p "$APPIMAGE_EXTRACT_ROOT"
(
  cd "$APPIMAGE_EXTRACT_ROOT"
  "$APPIMAGE" --appimage-extract >/dev/null
)
test -x "$APPIMAGE_APP/AppRun"
test -x "$APPIMAGE_APP/usr/lib/deck-workbench/deck-workbench"
test -f "$APPIMAGE_APP/usr/lib/deck-workbench/resources/app/legal/AppImage-type2-runtime-LICENSE"
node "$REPOSITORY_ROOT/scripts/verify-workspace-type-assets.mjs" \
  "$APPIMAGE_APP/usr/lib/deck-workbench/resources/app/build/generated/workspace" \
  "$APPIMAGE_APP/usr/lib/deck-workbench/resources/app/legal"
file "$APPIMAGE_APP/usr/lib/deck-workbench/deck-workbench" | tee "$EVIDENCE_ROOT/appimage-inner-executable.txt"
grep -Eq 'ELF 64-bit.*x86-64' "$EVIDENCE_ROOT/appimage-inner-executable.txt"
node --input-type=module - \
  "$APPIMAGE_APP/usr/lib/deck-workbench/resources/app/deck-workbench-build.json" \
  "$COMMIT_SHA" <<'NODE'
import { readFileSync } from 'node:fs'

const [, , path, expectedCommit] = process.argv
const identity = JSON.parse(readFileSync(path, 'utf8'))
if (identity.repository !== 'bomkino/deck-workbench') throw new Error('AppImage repository identity mismatch')
if (identity.commit !== expectedCommit) throw new Error(`AppImage commit identity mismatch: ${identity.commit}`)
if (identity.platform !== 'linux' || identity.architecture !== 'x86_64') throw new Error('AppImage platform identity mismatch')
if (identity.electron !== '44.0.0') throw new Error('AppImage Electron identity mismatch')
NODE

run_two_phase_journey \
  "$APPIMAGE" \
  "$APPIMAGE_JOURNEY_ROOT" \
  "$EXTRACT_ROOT/appimage-config" \
  true

node scripts/linux/verify-linux-journey-result.mjs \
  "$APPIMAGE_JOURNEY_ROOT/journey-result.json" \
  'exact AppImage'

CURATE_GATE_STATUS="$EVIDENCE_ROOT/curate-gate-status.txt"
if [[ "${DW_REQUIRE_CURATE_JOURNEY:-0}" == "1" ]]; then
  test -s "$JOURNEY_ROOT/curate-journey-result.json"
  test -s "$APPIMAGE_JOURNEY_ROOT/curate-journey-result.json"
  node scripts/verify-curate-journey-output.mjs \
    "$JOURNEY_ROOT/curate-journey-result.json" \
    "$COMMIT_SHA" ubuntu-x64 tarball 'extracted Linux tarball'
  node scripts/verify-curate-journey-output.mjs \
    "$APPIMAGE_JOURNEY_ROOT/curate-journey-result.json" \
    "$COMMIT_SHA" ubuntu-x64 appimage 'exact AppImage'
  printf 'verified\t%s\t%s\n' "$COMMIT_SHA" 'extracted tarball and exact AppImage' > "$CURATE_GATE_STATUS"
else
  printf 'unverified\t%s\n' \
    'native packaged Curate tracer has not emitted curate-journey-result.json' \
    > "$CURATE_GATE_STATUS"
  echo 'WB-F02 packaged Curate journey: UNVERIFIED — native tracer output hook is inactive'
fi

pdfinfo "$APPIMAGE_JOURNEY_ROOT/tracer.pdf" | tee "$EVIDENCE_ROOT/appimage-pdfinfo.txt"
grep -Eq '^Pages:[[:space:]]+1$' "$EVIDENCE_ROOT/appimage-pdfinfo.txt"

sha256sum \
  "$ARCHIVE" \
  "$ARCH_PACKAGE" \
  "$APPIMAGE" \
  "$JOURNEY_ROOT/tracer.pdf" \
  "$APPIMAGE_JOURNEY_ROOT/tracer.pdf" \
  > "$EVIDENCE_ROOT/SHA256SUMS"
node scripts/linux/write-linux-evidence-receipt.mjs

echo "Verified packaged Linux x86_64 journey for $COMMIT_SHA"
