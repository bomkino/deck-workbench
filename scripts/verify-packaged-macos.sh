#!/bin/bash
set -euo pipefail
exec "$(dirname "$0")/verify-native-package.sh" "$@"
