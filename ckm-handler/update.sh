#!/usr/bin/env bash
# Direct alias to update-ckm-handler.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
if [ -f "/usr/local/bin/update-ckm" ]; then
  exec /usr/local/bin/update-ckm "$@"
elif [ -f "${SCRIPT_DIR}/../update-ckm-handler.sh" ]; then
  exec bash "${SCRIPT_DIR}/../update-ckm-handler.sh" "$@"
else
  exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/merlinthedev848/MSuite-SIP/main/update-ckm-handler.sh)"
fi
