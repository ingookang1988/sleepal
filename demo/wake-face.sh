#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! python3 -c 'import bleak' >/dev/null 2>&1; then
  echo "Bleak가 필요합니다:" >&2
  echo "  python3 -m pip install -r $SCRIPT_DIR/requirements.txt" >&2
  exit 2
fi

exec python3 "$SCRIPT_DIR/ble_face_trigger.py" "$@"
