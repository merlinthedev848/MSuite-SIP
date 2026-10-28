import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const SERVER_DOMAIN = process.env.SERVER_DOMAIN || 'handler.chriskendall.media';
export const APP_SECRET_KEY = process.env.APP_SECRET_KEY || 'UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE';

// Admin Authentication
export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
export const ADMIN_PASS = process.env.ADMIN_PASS || 'MerlinAdmin2026!';

// Base Data Directories (GDPR Segregation)
export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
export const VAULT_DIR = path.join(DATA_DIR, 'vault');
export const UPLOADS_DIR = path.join(VAULT_DIR, 'uploads');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Operational Database (Zero PII) & GDPR Communications Vault
export const SYSTEM_DB_PATH = path.join(DATA_DIR, 'system.db');
export const VAULT_DB_PATH = path.join(VAULT_DIR, 'comms_vault.db');

// PBX Defaults
export const DEFAULT_PBX_SERVER = process.env.PBX_SERVER || 'pbx.chriskendall.media';
export const DEFAULT_PBX_PORT = parseInt(process.env.PBX_PORT || '5060', 10);
export const DEFAULT_PBX_TRANSPORT = process.env.PBX_TRANSPORT || 'UDP';
export const LICENSE_KEY = process.env.LICENSE_KEY || 'MANAGED-STANDARD';
