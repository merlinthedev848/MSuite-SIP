#!/usr/bin/env bash
# ==============================================================================
# CKM Handler Quick-Updater for Debian 12 / Ubuntu VPS
# Automatically pulls the latest branch, builds TypeScript, and restarts PM2.
# ==============================================================================

set -euo pipefail

REPO_DIR="/root/MSuite-SIP"
APP_DIR="/var/www/ckm-handler"
BRANCH="${GIT_BRANCH:-main}"
GIT_REPO="https://github.com/merlinthedev848/MSuite-SIP.git"

echo "=============================================================================="
echo "[*] Updating CKM Handler (Branch: ${BRANCH})..."
echo "=============================================================================="

# Ensure Git repository exists on host
if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "[*] Cloning MSuite-SIP (${BRANCH}) to ${REPO_DIR}..."
  rm -rf "${REPO_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "${GIT_REPO}" "${REPO_DIR}"
else
  echo "[*] Fetching and pulling latest changes from origin/${BRANCH}..."
  cd "${REPO_DIR}"
  git fetch origin "${BRANCH}"
  git remote set-branches origin "*" 2>/dev/null || true
  git checkout -B "${BRANCH}" FETCH_HEAD
  git reset --hard FETCH_HEAD
fi

echo "[*] Syncing updated source files, templates, and admin dashboard..."
mkdir -p "${APP_DIR}"
cp -r "${REPO_DIR}/ckm-handler/src" "${APP_DIR}/"
cp -r "${REPO_DIR}/ckm-handler/public" "${APP_DIR}/"
cp "${REPO_DIR}/ckm-handler/package.json" "${APP_DIR}/"
cp "${REPO_DIR}/ckm-handler/package-lock.json" "${APP_DIR}/" 2>/dev/null || true
cp "${REPO_DIR}/ckm-handler/tsconfig.json" "${APP_DIR}/"

# Also install update helper in /usr/local/bin and /var/www/ckm-handler
cp "${REPO_DIR}/update-ckm-handler.sh" "${APP_DIR}/update.sh" 2>/dev/null || true
chmod +x "${APP_DIR}/update.sh" 2>/dev/null || true
ln -sfn "${APP_DIR}/update.sh" /usr/local/bin/update-ckm-handler 2>/dev/null || true

cd "${APP_DIR}"
if [ ! -d "node_modules" ] || [ package.json -nt node_modules ]; then
  echo "[*] Synchronizing dependencies..."
  npm install --no-audit --prefer-offline 2>/dev/null || npm install 2>/dev/null || true
fi
echo "[*] Building application with TypeScript..."
npm run build

echo "[*] Restarting PM2 process..."
pm2 restart ckm-handler 2>/dev/null || pm2 restart all 2>/dev/null || systemctl restart ckm-handler 2>/dev/null || true

echo "=============================================================================="
echo "[+] CKM Handler successfully updated & restarted!"
echo "    Visit: https://handler.chriskendall.media/admin"
echo "=============================================================================="
