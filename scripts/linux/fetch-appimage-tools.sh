#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOLS_ROOT="$REPOSITORY_ROOT/build/appimage-tools"

APPIMAGETOOL_VERSION="1.9.1"
APPIMAGETOOL_SHA256="ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
APPIMAGETOOL_URL="https://github.com/AppImage/appimagetool/releases/download/${APPIMAGETOOL_VERSION}/appimagetool-x86_64.AppImage"
APPIMAGETOOL="$TOOLS_ROOT/appimagetool-x86_64.AppImage"

RUNTIME_VERSION="20251108"
RUNTIME_SHA256="2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"
RUNTIME_URL="https://github.com/AppImage/type2-runtime/releases/download/${RUNTIME_VERSION}/runtime-x86_64"
RUNTIME="$TOOLS_ROOT/runtime-x86_64"

for command in curl sha256sum; do
  if ! command -v "$command" >/dev/null; then
    echo "DependencyGate: $command is required to fetch AppImage build inputs" >&2
    exit 2
  fi
done

mkdir -p "$TOOLS_ROOT"

fetch_verified() {
  local url="$1"
  local expected_sha256="$2"
  local destination="$3"
  local temporary="${destination}.download"

  if [[ -f "$destination" ]] && printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum -c --status; then
    return
  fi

  rm -f "$temporary"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$temporary" "$url"
  printf '%s  %s\n' "$expected_sha256" "$temporary" | sha256sum -c
  mv "$temporary" "$destination"
}

fetch_verified "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" "$APPIMAGETOOL"
fetch_verified "$RUNTIME_URL" "$RUNTIME_SHA256" "$RUNTIME"
chmod 0755 "$APPIMAGETOOL" "$RUNTIME"

printf '%s  %s\n' "$APPIMAGETOOL_SHA256" "$APPIMAGETOOL"
printf '%s  %s\n' "$RUNTIME_SHA256" "$RUNTIME"
