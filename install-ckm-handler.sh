#!/usr/bin/env bash
# Direct alias to install-merlinsip-backend.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
exec bash "${SCRIPT_DIR}/install-merlinsip-backend.sh" "$@"
