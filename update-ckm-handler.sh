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

# Ensure Git repository exists on host with fallback to fresh clone
if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "[*] Cloning MSuite-SIP (${BRANCH}) to ${REPO_DIR}..."
  rm -rf "${REPO_DIR}"
  git clone --depth 1 --branch "${BRANCH}" "${GIT_REPO}" "${REPO_DIR}"
else
  echo "[*] Fetching and pulling latest changes from origin/${BRANCH}..."
  cd "${REPO_DIR}"
  if ! git fetch --depth 1 origin "${BRANCH}" 2>/dev/null; then
    echo "[!] Existing repository cache out-of-sync. Re-cloning fresh..."
    cd /
    rm -rf "${REPO_DIR}"
    git clone --depth 1 --branch "${BRANCH}" "${GIT_REPO}" "${REPO_DIR}"
  else
    git reset --hard FETCH_HEAD
  fi
fi

echo "[*] Syncing updated source files, templates, and admin dashboard..."
mkdir -p "${APP_DIR}"
cp -r "${REPO_DIR}/ckm-handler/src" "${APP_DIR}/"
cp -r "${REPO_DIR}/ckm-handler/public" "${APP_DIR}/"
cp -r "${REPO_DIR}/ckm-handler/test" "${APP_DIR}/" 2>/dev/null || true
cp "${REPO_DIR}/ckm-handler/package.json" "${APP_DIR}/"
cp "${REPO_DIR}/ckm-handler/package-lock.json" "${APP_DIR}/" 2>/dev/null || true
cp "${REPO_DIR}/ckm-handler/tsconfig.json" "${APP_DIR}/"

# Also install update helper in /usr/local/bin and /var/www/ckm-handler
cp "${REPO_DIR}/update-ckm-handler.sh" "${APP_DIR}/update.sh" 2>/dev/null || true
chmod +x "${APP_DIR}/update.sh" 2>/dev/null || true
ln -sfn "${APP_DIR}/update.sh" /usr/local/bin/update-ckm 2>/dev/null || true
ln -sfn "${APP_DIR}/update.sh" /usr/local/bin/update-ckm-handler 2>/dev/null || true

cd "${APP_DIR}"
echo "[*] Synchronizing dependencies..."
npm install --no-audit

echo "[*] Building application with TypeScript..."
npm run build

echo "[*] Restarting PM2 process..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ckm-handler --update-env 2>/dev/null || pm2 restart all 2>/dev/null || pm2 start dist/server.js --name ckm-handler --cwd "${APP_DIR}"
  pm2 save 2>/dev/null || true
elif systemctl is-active --quiet ckm-handler 2>/dev/null; then
  systemctl restart ckm-handler 2>/dev/null || true
fi

echo "=============================================================================="
echo "[+] CKM Handler successfully updated & restarted!"
echo "    Visit: https://handler.chriskendall.media/admin"
echo "    Future updates: run 'update-ckm' or '/var/www/ckm-handler/update.sh'"
echo "=============================================================================="
