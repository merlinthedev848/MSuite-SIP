#!/usr/bin/env bash
# ==============================================================================
# MerlinSIP VoIP Backend: Clean-Slate One-Line Installer for Debian Server
# Sets up Node.js 20 LTS, build tools, better-sqlite3, Express + Socket.IO,
# PM2 with systemd persistence, and Nginx reverse proxy for WSS & HTTPS.
# ==============================================================================

set -euo pipefail

# Ensure running as root
if [ "$(id -u)" -ne 0 ]; then
  echo "[-] This installer must be run as root (or via sudo)." >&2
  exit 1
fi

APP_DIR="/var/www/merlinsip-backend"
APP_USER="root"
APP_PORT=4000
APP_SECRET="UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE"
DOMAIN="handler.chriskendall.media"

echo "[*] Step 1: Updating system packages and installing prerequisites..."
apt-get update -y
apt-get install -y curl gnupg build-essential python3 nginx certbot python3-certbot-nginx ufw

# Install Node.js 20 LTS via NodeSource if not already present
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
  echo "[*] Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[*] Node.js version: $(node -v)"
echo "[*] npm version: $(npm -v)"

# Install PM2 globally
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[*] Installing PM2 process manager..."
  npm install -g pm2
fi

echo "[*] Step 2: Preparing application directory at ${APP_DIR}..."
# Stop existing PM2 instance if running
pm2 delete merlinsip-backend >/dev/null 2>&1 || true

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/src/routes" "${APP_DIR}/uploads"

# Create package.json
cat << 'EOF' > "${APP_DIR}/package.json"
{
  "name": "merlinsip-backend",
  "version": "1.0.0",
  "description": "VoIP Chat & Data Signaling Backend for MerlinSIP",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.12.7",
    "typescript": "^5.4.5"
  }
}
EOF

# Create tsconfig.json
cat << 'EOF' > "${APP_DIR}/tsconfig.json"
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
EOF

# Create .env
cat << EOF > "${APP_DIR}/.env"
PORT=${APP_PORT}
HOST=127.0.0.1
APP_SECRET_KEY=${APP_SECRET}
CORS_ORIGIN=*
DB_FILE=${APP_DIR}/database.sqlite
UPLOAD_DIR=${APP_DIR}/uploads
EOF

# Create src/routes/files.ts
cat << 'EOF' > "${APP_DIR}/src/routes/files.ts"
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// POST /files/upload (matches MerlinSIP ChatConnectorService)
router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const relativeUrl = `/files/download/${req.file.filename}`;
  return res.status(200).json({
    success: true,
    url: relativeUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size
  });
});

// GET /files/download/:filename
router.get('/download/:filename', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  res.sendFile(filePath);
});

export default router;
EOF

# Create src/server.ts
cat << 'EOF' > "${APP_DIR}/src/server.ts"
import express, { Request, Response } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import Database from 'better-sqlite3';
import fileRoutes from './routes/files';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Trust Nginx reverse proxy headers
app.set('trust proxy', 1);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(cors());
app.use(express.json());

// Latency & health probe endpoint for MerlinSIP
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Mount /files router
app.use('/files', fileRoutes);

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const dbPath = process.env.DB_FILE || path.join(__dirname, '../database.sqlite');

// Initialize better-sqlite3 in WAL mode
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
console.log('Connected to SQLite database in WAL mode.');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    content TEXT NOT NULL,
    file_name TEXT,
    file_size INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, id DESC);
`);

// Handshake authentication middleware
io.use((socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
  const expectedKey = process.env.APP_SECRET_KEY;

  if (token && token === expectedKey) {
    console.log(`[AUTH] Client authenticated: ${socket.id}`);
    return next();
  }
  
  console.warn(`[AUTH] Unauthorized client rejected: ${socket.id}`);
  return next(new Error('Invalid app token'));
});

// Socket.io Real-time event handlers
io.on('connection', (socket: Socket) => {
  socket.on('join_conversation', (conversationId: string) => {
    if (!conversationId) return;
    const room = `conv_${conversationId.trim()}`;
    socket.join(room);
    console.log(`[ROOM] Socket ${socket.id} joined ${room}`);
  });

  socket.on('send_message', (data: any) => {
    try {
      if (!data) return;

      // Handle both camelCase and snake_case parameters cleanly
      const conversationId = String(data.conversationId || data.conversation_id || '').trim();
      const senderId = String(data.senderId || data.sender_id || '').trim();
      const messageType = String(data.messageType || data.message_type || 'text').trim();
      const content = String(data.content || '');
      const fileName = data.fileName || data.file_name || null;
      const fileSize = data.fileSize ?? data.file_size ?? null;

      if (!conversationId || !content) {
        socket.emit('error', { message: 'conversationId and content are required' });
        return;
      }

      const query = `
        INSERT INTO messages (conversation_id, sender_id, message_type, content, file_name, file_size)
        VALUES (?, ?, ?, ?, ?, ?);
      `;
      const stmt = db.prepare(query);
      const info = stmt.run(conversationId, senderId, messageType, content, fileName, fileSize);
      const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(info.lastInsertRowid) as any;

      if (row) {
        // Broadcast payload containing both naming conventions to guarantee client compatibility
        const payload = {
          id: row.id,
          conversation_id: row.conversation_id,
          conversationId: row.conversation_id,
          sender_id: row.sender_id,
          senderId: row.sender_id,
          message_type: row.message_type,
          messageType: row.message_type,
          content: row.content,
          file_name: row.file_name,
          fileName: row.file_name,
          file_size: row.file_size,
          fileSize: row.file_size,
          file_url: messageType === 'file' ? row.content : null,
          fileUrl: messageType === 'file' ? row.content : null,
          timestamp: row.timestamp
        };

        const room = `conv_${conversationId}`;
        io.to(room).emit('receive_message', payload);
        console.log(`[MSG] Emitted message ${row.id} to room ${room}`);
      }
    } catch (err: any) {
      console.error('[MSG ERROR] Failed to save message:', err.message);
      socket.emit('error', { message: 'Failed to send message: ' + err.message });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] Socket ${socket.id} disconnected: ${reason}`);
  });
});

// Bind explicitly to 127.0.0.1 (Loopback only)
server.listen(PORT, HOST, () => {
  console.log(`🚀 MerlinSIP Data Handler running locally on http://${HOST}:${PORT}`);
});
EOF

echo "[*] Step 3: Installing npm dependencies and compiling TypeScript..."
cd "${APP_DIR}"
npm install
npx tsc

echo "[*] Step 4: Configuring PM2 for auto-restart on boot..."
pm2 start dist/server.js --name merlinsip-backend
pm2 save
pm2 startup systemd -u "${APP_USER}" --hp "/root" >/dev/null 2>&1 || true

echo "[*] Step 5: Configuring Nginx reverse proxy for ${DOMAIN}..."

# Check if SSL certificates already exist
SSL_EXISTS=false
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  SSL_EXISTS=true
fi

cat << 'EOF' > /etc/nginx/conf.d/websocket_map.conf
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

if [ "${SSL_EXISTS}" = true ]; then
  echo "[*] Existing SSL certificate found for ${DOMAIN}. Configuring full HTTPS/WSS block..."
  cat << EOF > "/etc/nginx/sites-available/${DOMAIN}"
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;

        # Client IP headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Keepalive & Buffering
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}
EOF
else
  echo "[*] No existing SSL found. Configuring HTTP block first..."
  cat << EOF > "/etc/nginx/sites-available/${DOMAIN}"
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

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

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl reload nginx

echo "[*] Step 6: Verifying local service health..."
sleep 2
curl -s http://127.0.0.1:${APP_PORT}/api/health || {
  echo "[-] Local service health check failed. Check 'pm2 logs merlinsip-backend'" >&2
  exit 1
}

echo ""
echo "=============================================================================="
echo "✅ MerlinSIP Backend Successfully Installed & Running!"
echo "   - Status: Active on 127.0.0.1:${APP_PORT} (Loopback only)"
echo "   - Database: ${APP_DIR}/database.sqlite (WAL mode enabled)"
echo "   - PM2 Process: 'merlinsip-backend' (persistent across reboots)"
echo "   - Domain: https://${DOMAIN}"
if [ "${SSL_EXISTS}" = false ]; then
  echo ""
  echo "⚠️  Action Required: Run certbot to obtain SSL:"
  echo "    certbot --nginx -d ${DOMAIN}"
fi
echo "=============================================================================="
