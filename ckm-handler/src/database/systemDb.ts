import { ServerConfigRow } from '../types/models';
import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import { SYSTEM_DB_PATH, DEFAULT_PBX_SERVER, DEFAULT_PBX_PORT, DEFAULT_PBX_TRANSPORT, SERVER_DOMAIN, LICENSE_KEY, ADMIN_USER, ADMIN_PASS } from '../config';

const systemDb = new Database(SYSTEM_DB_PATH);

// ==============================================================================
// Cryptographic Password Hashing & Timing-Safe Verification
// ==============================================================================
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, generatedSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: generatedSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const checkHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const checkBuf = Buffer.from(checkHash, 'hex');
    if (hashBuf.length !== checkBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, checkBuf);
  } catch {
    return false;
  }
}

// ==============================================================================
// High-Speed Engine & Security Tuning
// ==============================================================================
// 1. WAL Mode: Non-blocking readers and writers running concurrently
systemDb.pragma('journal_mode = WAL');

// 2. Normal Synchronous: In WAL mode, fully crash-safe while eliminating fsync disk bottleneck (50x write throughput boost)
systemDb.pragma('synchronous = NORMAL');

// 3. Memory-Mapped I/O: 256MB mmap bypasses OS read syscalls for sub-millisecond lookups
systemDb.pragma('mmap_size = 268435456');

// 4. Dedicated 64MB In-Memory Page Cache
systemDb.pragma('cache_size = -64000');

// 5. In-Memory Temp Tables & Query Sorters
systemDb.pragma('temp_store = MEMORY');

// 6. Lock Collision Resilience: 5-second automatic busy retry
systemDb.pragma('busy_timeout = 5000');

// 7. Enforce Relational Integrity at C-speed
systemDb.pragma('foreign_keys = ON');

// 8. Secure Zero-Fill Deletion (GDPR Security)
systemDb.pragma('secure_delete = ON');

// Restrict filesystem permissions (Read/Write owner only)
try {
  if (fs.existsSync(SYSTEM_DB_PATH)) {
    fs.chmodSync(SYSTEM_DB_PATH, 0o600);
  }
} catch {
  // ignore on non-POSIX / Windows dev
}

// ==============================================================================
// Operational Tables (Zero PII)
// ==============================================================================
systemDb.exec(`
  CREATE TABLE IF NOT EXISTS server_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pbx_server TEXT NOT NULL,
    pbx_port INTEGER NOT NULL,
    pbx_transport TEXT NOT NULL,
    data_handler_url TEXT NOT NULL,
    license_key TEXT,
    api_key TEXT,
    brand_name TEXT DEFAULT 'MerlinSIP',
    primary_color TEXT DEFAULT '#2563EB',
    accent_color TEXT DEFAULT '#38BDF8',
    logo_url TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS extensions (
    extension TEXT PRIMARY KEY,
    sip_username TEXT NOT NULL,
    sip_password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS softphone_pins (
    code TEXT PRIMARY KEY,
    extension TEXT NOT NULL,
    claimed INTEGER DEFAULT 0,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (extension) REFERENCES extensions (extension) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS physical_handsets (
    mac_address TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    model TEXT,
    extension TEXT NOT NULL,
    line_label TEXT,
    blf_keys_json TEXT,
    last_provisioned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (extension) REFERENCES extensions (extension) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS routers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT,
    mac_address TEXT,
    lan_subnet TEXT DEFAULT '192.168.1.1/24',
    voice_vlan_id INTEGER DEFAULT 20,
    voice_subnet TEXT DEFAULT '10.20.0.1/24',
    disable_sip_alg INTEGER DEFAULT 1,
    enable_qos INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'technician',
    permissions TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT DEFAULT '127.0.0.1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS discovered_devices (
    mac_address TEXT PRIMARY KEY,
    brand TEXT,
    model TEXT,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'PENDING_ADOPTION',
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS firmware_binaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL DEFAULT 'handset',
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    version TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    sha256 TEXT,
    download_url TEXT,
    status TEXT DEFAULT 'NOT_DOWNLOADED',
    error_message TEXT,
    downloaded_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(brand, model, filename)
  );

  CREATE INDEX IF NOT EXISTS idx_pins_extension ON softphone_pins (extension);
  CREATE INDEX IF NOT EXISTS idx_handsets_extension ON physical_handsets (extension);
  CREATE INDEX IF NOT EXISTS idx_routers_mac ON routers (mac_address);
  CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username);
  CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions (token);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_activity_logs (id DESC);
  CREATE INDEX IF NOT EXISTS idx_firmware_lookup ON firmware_binaries (brand, model);
`);

export function logActivity(eventType: string, details: string, ipAddress: string = '127.0.0.1') {
  try {
    systemDb.prepare(`
      INSERT INTO audit_activity_logs (event_type, details, ip_address)
      VALUES (?, ?, ?)
    `).run(eventType, details, ipAddress);
  } catch {}
}

// Seed default server config if missing
const checkConfig = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined;
if (!checkConfig) {
  systemDb.prepare(`
    INSERT INTO server_config (id, pbx_server, pbx_port, pbx_transport, data_handler_url, license_key)
    VALUES (1, ?, ?, ?, ?, ?)
  `).run(
    DEFAULT_PBX_SERVER,
    DEFAULT_PBX_PORT,
    DEFAULT_PBX_TRANSPORT,
    `https://${SERVER_DOMAIN}`,
    LICENSE_KEY
  );
} else if (checkConfig.data_handler_url && checkConfig.data_handler_url.includes('handler.chriskendall.media') && SERVER_DOMAIN !== 'handler.chriskendall.media') {
  systemDb.prepare('UPDATE server_config SET data_handler_url = ? WHERE id = 1').run(`https://${SERVER_DOMAIN}`);
}

// Ensure api_key column exists
try {
  systemDb.exec('ALTER TABLE server_config ADD COLUMN api_key TEXT;');
} catch {
  // column already exists
}

// Ensure branding customization columns exist
try { systemDb.exec("ALTER TABLE server_config ADD COLUMN brand_name TEXT DEFAULT 'MerlinSIP';"); } catch {}
try { systemDb.exec("ALTER TABLE server_config ADD COLUMN primary_color TEXT DEFAULT '#2563EB';"); } catch {}
try { systemDb.exec("ALTER TABLE server_config ADD COLUMN accent_color TEXT DEFAULT '#38BDF8';"); } catch {}
try { systemDb.exec("ALTER TABLE server_config ADD COLUMN logo_url TEXT DEFAULT '';"); } catch {}

// Auto-Adoption & Auto-Sync Server Configuration Columns
try { systemDb.exec('ALTER TABLE server_config ADD COLUMN auto_adopt_enabled INTEGER DEFAULT 0;'); } catch {}
try { systemDb.exec('ALTER TABLE server_config ADD COLUMN auto_sync_enabled INTEGER DEFAULT 1;'); } catch {}
try { systemDb.exec('ALTER TABLE server_config ADD COLUMN auto_sync_interval_mins INTEGER DEFAULT 5;'); } catch {}
try { systemDb.exec('ALTER TABLE server_config ADD COLUMN last_sync_at DATETIME;'); } catch {}
try { systemDb.exec("ALTER TABLE server_config ADD COLUMN last_sync_status TEXT DEFAULT 'IDLE';"); } catch {}

// Ensure editable custom configuration columns exist for Handsets & Routers
try { systemDb.exec("ALTER TABLE physical_handsets ADD COLUMN custom_config TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE routers ADD COLUMN custom_script TEXT DEFAULT '';"); } catch {}

// Ensure real-time telemetry and monitoring columns exist
try { systemDb.exec("ALTER TABLE physical_handsets ADD COLUMN ip_address TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE physical_handsets ADD COLUMN user_agent TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE physical_handsets ADD COLUMN firmware_version TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE routers ADD COLUMN last_fetched_at DATETIME;"); } catch {}
try { systemDb.exec("ALTER TABLE routers ADD COLUMN last_ip TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE extensions ADD COLUMN last_registered_at DATETIME;"); } catch {}
try { systemDb.exec("ALTER TABLE extensions ADD COLUMN last_ip TEXT DEFAULT '';"); } catch {}
try { systemDb.exec("ALTER TABLE extensions ADD COLUMN user_agent TEXT DEFAULT '';"); } catch {}

// Generate default secure API key if not set
const cfgRow = systemDb.prepare('SELECT api_key FROM server_config WHERE id = 1').get() as { api_key: string | null } | undefined;
if (!cfgRow?.api_key) {
  const newKey = `ckm_live_${crypto.randomBytes(16).toString('hex')}`;
  systemDb.prepare('UPDATE server_config SET api_key = ? WHERE id = 1').run(newKey);
}

// Seed default superadmin if admin_users is empty
const adminUserCount = (systemDb.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number }).count;
if (adminUserCount === 0) {
  const initialUser = (ADMIN_USER || 'admin').trim();
  const initialPass = ADMIN_PASS || 'ChangeMeImmediately123!';
  const { hash, salt } = hashPassword(initialPass);
  const allPermissions = JSON.stringify(['*']);

  systemDb.prepare(`
    INSERT INTO admin_users (username, password_hash, salt, display_name, role, permissions, is_active)
    VALUES (?, ?, ?, ?, 'superadmin', ?, 1)
  `).run(initialUser, hash, salt, 'System Administrator', allPermissions);
}

export default systemDb;
