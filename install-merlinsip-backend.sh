#!/usr/bin/env bash
# ==============================================================================
# CKM Handler & MerlinSIP Unified Backend: Clean-Slate One-Click Installer
# Supported OS: Debian 12 (Bookworm) / Ubuntu 22.04+
# Sets up:
#  - Node.js 20 LTS & native build tools for SQLite
#  - CKM Handler (Express, Socket.IO, dual SQLite WAL databases, Admin Portal)
#  - PM2 daemon with systemd persistent service
#  - Nginx reverse proxy with WebSocket support & 50MB uploads
#  - UFW firewall rules & Certbot SSL setup
# ==============================================================================

set -euo pipefail

# Ensure running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "[-] This installer must be run as root (or via sudo)." >&2
  exit 1
fi

APP_DIR="/var/www/ckm-handler"
LEGACY_DIR="/var/www/merlinsip-backend"
APP_USER="root"
APP_PORT=3000
SERVER_DOMAIN="${SERVER_DOMAIN:-handler.chriskendall.media}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMeImmediately123!}"
APP_SECRET="${APP_SECRET:-UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE}"
PBX_SERVER="${PBX_SERVER:-pbx.chriskendall.media}"
PBX_PORT="${PBX_PORT:-5060}"
PBX_TRANSPORT="${PBX_TRANSPORT:-UDP}"
LICENSE_KEY="${LICENSE_KEY:-MANAGED-STANDARD}"
GIT_BRANCH="${GIT_BRANCH:-beta/provisioning-and-contractor-licensing}"
GIT_REPO="https://github.com/merlinthedev848/MSuite-SIP.git"

echo "=============================================================================="
echo "🚀 Starting CKM Handler One-Click Installation on Debian 12"
echo "   Domain:       ${SERVER_DOMAIN}"
echo "   Port:         ${APP_PORT}"
echo "   Admin User:   ${ADMIN_USER}"
echo "   Git Branch:   ${GIT_BRANCH}"
echo "=============================================================================="

echo "[*] Step 1: Updating system packages and installing prerequisites..."
apt-get update -y
apt-get install -y curl git gnupg build-essential python3 make g++ nginx certbot python3-certbot-nginx ufw sqlite3

# Install Node.js 20 LTS via NodeSource if not already present or if version < 20
NEED_NODE=false
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=true
else
  CURRENT_NODE_VER=$(node -v | cut -d'.' -f1 | tr -d 'v')
  if [ "$CURRENT_NODE_VER" -lt 20 ]; then
    NEED_NODE=true
  fi
fi

if [ "$NEED_NODE" = true ]; then
  echo "[*] Installing Node.js 20 LTS from NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[*] Node.js version: $(node -v)"
echo "[*] npm version: $(npm -v)"

# Install PM2 globally if missing
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[*] Installing PM2 process manager globally..."
  npm install -g pm2
fi

echo "[*] Step 2: Preparing application files..."
# Stop existing PM2 instance if running
pm2 delete ckm-handler >/dev/null 2>&1 || true
pm2 delete merlinsip-backend >/dev/null 2>&1 || true

mkdir -p "${APP_DIR}"

# Check if we are running inside the repository directory containing ckm-handler/
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
fi
if [ -n "${SCRIPT_DIR}" ] && [ -d "${SCRIPT_DIR}/ckm-handler/src" ]; then
  echo "[*] Found local ckm-handler source at ${SCRIPT_DIR}/ckm-handler. Copying..."
  cp -r "${SCRIPT_DIR}/ckm-handler/"* "${APP_DIR}/"
else
  echo "[*] Cloning latest ckm-handler from GitHub (${GIT_BRANCH})..."
  TEMP_REPO=$(mktemp -d)
  git clone --depth 1 --branch "${GIT_BRANCH}" "${GIT_REPO}" "${TEMP_REPO}"
  cp -r "${TEMP_REPO}/ckm-handler/"* "${APP_DIR}/"
  rm -rf "${TEMP_REPO}"
fi

# Create backwards compatibility symlink for legacy paths
mkdir -p "$(dirname "${LEGACY_DIR}")"
ln -sfn "${APP_DIR}" "${LEGACY_DIR}"

# Ensure data directories exist
mkdir -p "${APP_DIR}/data/vault/uploads"

# Create / update .env
ENV_FILE="${APP_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  echo "[*] Generating production .env file..."
  cat << EOF > "${ENV_FILE}"
NODE_ENV=production
PORT=${APP_PORT}
SERVER_DOMAIN=${SERVER_DOMAIN}
ADMIN_USER=${ADMIN_USER}
ADMIN_PASS=${ADMIN_PASS}
APP_SECRET_KEY=${APP_SECRET}
PBX_SERVER=${PBX_SERVER}
PBX_PORT=${PBX_PORT}
PBX_TRANSPORT=${PBX_TRANSPORT}
LICENSE_KEY=${LICENSE_KEY}
DATA_DIR=${APP_DIR}/data
EOF
fi

echo "[*] Step 3: Installing npm dependencies & compiling TypeScript..."
cd "${APP_DIR}"
npm install
npm run build

echo "[*] Step 4: Configuring PM2 auto-restart and systemd daemon..."
pm2 start dist/server.js --name ckm-handler --cwd "${APP_DIR}"
pm2 save
pm2 startup systemd -u "${APP_USER}" --hp "/root" >/dev/null 2>&1 || true

echo "[*] Step 5: Configuring Nginx reverse proxy with WebSocket & SSL support..."
cat << 'EOF' > /etc/nginx/conf.d/websocket_map.conf
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

SSL_EXISTS=false
if [ -f "/etc/letsencrypt/live/${SERVER_DOMAIN}/fullchain.pem" ]; then
  SSL_EXISTS=true
fi

if [ "${SSL_EXISTS}" = true ]; then
  echo "[*] Existing SSL certificate found for ${SERVER_DOMAIN}. Configuring HTTPS/WSS block..."
  cat << EOF > "/etc/nginx/sites-available/${SERVER_DOMAIN}"
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${SERVER_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SERVER_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
else
  echo "[*] Configuring HTTP block for ${SERVER_DOMAIN}..."
  cat << EOF > "/etc/nginx/sites-available/${SERVER_DOMAIN}"
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_DOMAIN} _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
fi

ln -sf "/etc/nginx/sites-available/${SERVER_DOMAIN}" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl reload nginx

echo "[*] Step 6: Configuring UFW firewall rules..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  echo "y" | ufw enable || true
fi

echo "[*] Step 7: Verifying service health..."
HEALTH_STATUS="FAIL"
for i in {1..15}; do
  HEALTH_STATUS=$(curl -s --max-time 2 "http://127.0.0.1:${APP_PORT}/api/health" || echo "FAIL")
  if [[ "$HEALTH_STATUS" == *"ok"* ]]; then
    break
  fi
  sleep 1
done
if [[ "$HEALTH_STATUS" != *"ok"* ]]; then
  echo "[-] Local service health check failed. Check 'pm2 logs ckm-handler'" >&2
  exit 1
fi

echo ""
echo "=============================================================================="
echo "✅ CKM Handler Successfully Installed & Active on Debian 12!"
echo "   - Status: Active on 127.0.0.1:${APP_PORT} (PM2: 'ckm-handler')"
echo "   - Admin Portal: http://${SERVER_DOMAIN}/admin (or http://<SERVER_IP>/admin)"
echo "   - Admin Username: ${ADMIN_USER}"
echo "   - Admin Password: ${ADMIN_PASS}"
echo "   - Operational DB: ${APP_DIR}/data/system.db (WAL mode)"
echo "   - GDPR Vault DB:  ${APP_DIR}/data/vault/comms_vault.db (WAL mode)"
echo "   - Storage Vault:  ${APP_DIR}/data/vault/uploads"
if [ "${SSL_EXISTS}" = false ]; then
  echo ""
  echo "💡 To obtain free SSL with Let's Encrypt, run:"
  echo "   certbot --nginx -d ${SERVER_DOMAIN}"
fi
echo "=============================================================================="
