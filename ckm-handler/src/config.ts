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
export const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
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

// PBX Defaults
export const DEFAULT_PBX_SERVER = process.env.PBX_SERVER || 'pbx.chriskendall.media';
export const DEFAULT_PBX_PORT = parseInt(process.env.PBX_PORT || '5060', 10);
export const DEFAULT_PBX_TRANSPORT = process.env.PBX_TRANSPORT || 'UDP';
export const LICENSE_KEY = process.env.LICENSE_KEY || 'MANAGED-STANDARD';

const STOCK_HANDLER_HOST = 'handler.chriskendall.media';

export function stockHandlerUrl(): string {
  return `https://${SERVER_DOMAIN}`.replace(/\/$/, '');
}

/** True when the saved handler URL is still the built-in default and was not set via SERVER_DOMAIN. */
export function isStockHandlerUrl(stored: string | null | undefined): boolean {
  if (process.env.SERVER_DOMAIN) return false;
  const value = String(stored || '').trim().replace(/\/$/, '');
  return !value || value === stockHandlerUrl() || value.includes(STOCK_HANDLER_HOST);
}

/**
 * Public URL phones and welcome cards should use.
 * A fresh install keeps the stock domain in the database, but a dashboard opened
 * on another host should advertise the host that actually answered the request
 * until an operator saves a public URL.
 */
export function resolvePublicHandlerUrl(
  stored: string | null | undefined,
  requestHost?: string | null,
  requestProtocol?: string | null
): string {
  const configured = String(stored || '').trim().replace(/\/$/, '');
  const effective = configured || stockHandlerUrl();
  const host = String(requestHost || '').trim();
  if (!host || !isStockHandlerUrl(effective)) return effective;
  if (host.includes(STOCK_HANDLER_HOST)) return effective;
  const proto = requestProtocol === 'https' ? 'https' : 'http';
  return `${proto}://${host}`.replace(/\/$/, '');
}
