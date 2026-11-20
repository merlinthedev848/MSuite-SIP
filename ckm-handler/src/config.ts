import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Support loading .env from app root regardless of PM2 working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const SERVER_DOMAIN = process.env.SERVER_DOMAIN || 'handler.chriskendall.media';
export const APP_SECRET_KEY = process.env.APP_SECRET_KEY || 'UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE';

// Admin Authentication
export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
export const ADMIN_PASS = process.env.ADMIN_PASS || 'MerlinAdmin2026!';

// Base Data Directories (GDPR Segregation)
// Strictly anchor to app root data directory regardless of PM2 working directory
export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
export const VAULT_DIR = path.join(DATA_DIR, 'vault');
export const UPLOADS_DIR = path.join(VAULT_DIR, 'uploads');
export const FIRMWARE_DIR = process.env.FIRMWARE_DIR || path.join(DATA_DIR, 'firmware');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(FIRMWARE_DIR)) fs.mkdirSync(FIRMWARE_DIR, { recursive: true });

// Operational Database (Zero PII) & GDPR Communications Vault
export const SYSTEM_DB_PATH = path.join(DATA_DIR, 'system.db');
export const VAULT_DB_PATH = path.join(VAULT_DIR, 'comms_vault.db');

// Auto-detect and restore legacy system.db if target database is fresh/empty
try {
  const isFreshDb = !fs.existsSync(SYSTEM_DB_PATH) || fs.statSync(SYSTEM_DB_PATH).size < 16384;
  if (isFreshDb) {
    const candidateOldDbPaths = [
      path.resolve(process.cwd(), 'data/system.db'),
      '/root/data/system.db',
      '/var/www/merlinsip-backend/data/system.db',
      '/root/MSuite-SIP/ckm-handler/data/system.db',
      '/root/ckm-handler/data/system.db'
    ];
    for (const oldPath of candidateOldDbPaths) {
      if (oldPath !== SYSTEM_DB_PATH && fs.existsSync(oldPath)) {
        const oldSize = fs.statSync(oldPath).size;
        if (oldSize > 16384) {
          console.log(`[Auto-Recovery] Found populated database at ${oldPath} (${oldSize} bytes). Restoring to ${SYSTEM_DB_PATH}...`);
          fs.copyFileSync(oldPath, SYSTEM_DB_PATH);
          if (fs.existsSync(`${oldPath}-wal`)) fs.copyFileSync(`${oldPath}-wal`, `${SYSTEM_DB_PATH}-wal`);
          if (fs.existsSync(`${oldPath}-shm`)) fs.copyFileSync(`${oldPath}-shm`, `${SYSTEM_DB_PATH}-shm`);
          break;
        }
      }
    }
  }

  const isFreshVault = !fs.existsSync(VAULT_DB_PATH) || fs.statSync(VAULT_DB_PATH).size < 16384;
  if (isFreshVault) {
    const candidateOldVaultPaths = [
      path.resolve(process.cwd(), 'data/vault/comms_vault.db'),
      '/root/data/vault/comms_vault.db',
      '/var/www/merlinsip-backend/data/vault/comms_vault.db'
    ];
    for (const oldPath of candidateOldVaultPaths) {
      if (oldPath !== VAULT_DB_PATH && fs.existsSync(oldPath)) {
        const oldSize = fs.statSync(oldPath).size;
        if (oldSize > 16384) {
          console.log(`[Auto-Recovery] Found populated vault at ${oldPath} (${oldSize} bytes). Restoring to ${VAULT_DB_PATH}...`);
          fs.copyFileSync(oldPath, VAULT_DB_PATH);
          if (fs.existsSync(`${oldPath}-wal`)) fs.copyFileSync(`${oldPath}-wal`, `${VAULT_DB_PATH}-wal`);
          if (fs.existsSync(`${oldPath}-shm`)) fs.copyFileSync(`${oldPath}-shm`, `${VAULT_DB_PATH}-shm`);
          break;
        }
      }
    }
  }
} catch (err: unknown) {
  console.warn('[Auto-Recovery] Notice checking legacy DB locations:', err);
}

// PBX Defaults
export const DEFAULT_PBX_SERVER = process.env.PBX_SERVER || 'pbx.chriskendall.media';
export const DEFAULT_PBX_PORT = parseInt(process.env.PBX_PORT || '5060', 10);
export const DEFAULT_PBX_TRANSPORT = process.env.PBX_TRANSPORT || 'UDP';
export const LICENSE_KEY = process.env.LICENSE_KEY || 'MANAGED-STANDARD';
