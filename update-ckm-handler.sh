#!/usr/bin/env bash
# ==============================================================================
# CKM Handler Quick-Updater for Debian 12 / Ubuntu VPS
# Automatically pulls the latest beta branch, builds TypeScript, and restarts PM2.
# ==============================================================================

set -euo pipefail

REPO_DIR="/root/MSuite-SIP"
APP_DIR="/var/www/ckm-handler"
BRANCH="${GIT_BRANCH:-beta/provisioning-and-contractor-licensing}"
GIT_REPO="https://github.com/merlinthedev848/MSuite-SIP.git"

echo "=============================================================================="
echo "🔄 Updating CKM Handler on beta-handler (${BRANCH})..."
echo "=============================================================================="

# Ensure Git repository exists on host
if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "[*] Cloning MSuite-SIP (${BRANCH}) to ${REPO_DIR}..."
  rm -rf "${REPO_DIR}"
  git clone -b "${BRANCH}" "${GIT_REPO}" "${REPO_DIR}"
else
  echo "[*] Fetching and pulling latest changes from origin/${BRANCH}..."
  cd "${REPO_DIR}"
  git fetch origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"
fi

echo "[*] Syncing updated source files, templates, and admin dashboard..."
mkdir -p "${APP_DIR}"
cp -r "${REPO_DIR}/ckm-handler/src" "${APP_DIR}/"
cp -r "${REPO_DIR}/ckm-handler/public" "${APP_DIR}/"
cp "${REPO_DIR}/ckm-handler/package.json" "${APP_DIR}/"
cp "${REPO_DIR}/ckm-handler/tsconfig.json" "${APP_DIR}/"

cd "${APP_DIR}"
echo "[*] Building application with TypeScript..."
npm run build

echo "[*] Restarting PM2 process..."
pm2 restart ckm-handler

echo "=============================================================================="
echo "✅ CKM Handler successfully updated & restarted!"
echo "   Visit: https://beta-handler.chriskendall.media/admin"
echo "=============================================================================="
