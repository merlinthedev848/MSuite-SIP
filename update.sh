#!/usr/bin/env bash
# Direct alias to update-ckm-handler.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
exec bash "${SCRIPT_DIR}/update-ckm-handler.sh" "$@"
