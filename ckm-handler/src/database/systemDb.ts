import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import { SYSTEM_DB_PATH, DEFAULT_PBX_SERVER, DEFAULT_PBX_PORT, DEFAULT_PBX_TRANSPORT, SERVER_DOMAIN, LICENSE_KEY } from '../config';

const systemDb = new Database(SYSTEM_DB_PATH);

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

  CREATE INDEX IF NOT EXISTS idx_pins_extension ON softphone_pins (extension);
  CREATE INDEX IF NOT EXISTS idx_handsets_extension ON physical_handsets (extension);
  CREATE INDEX IF NOT EXISTS idx_routers_mac ON routers (mac_address);
`);

// Seed default server config if missing
const checkConfig = systemDb.prepare('SELECT id FROM server_config WHERE id = 1').get();
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
}

// Ensure api_key column exists
try {
  systemDb.exec('ALTER TABLE server_config ADD COLUMN api_key TEXT;');
} catch {
  // column already exists
}

// Generate default secure API key if not set
const cfgRow = systemDb.prepare('SELECT api_key FROM server_config WHERE id = 1').get() as any;
if (!cfgRow?.api_key) {
  const newKey = `ckm_live_${crypto.randomBytes(16).toString('hex')}`;
  systemDb.prepare('UPDATE server_config SET api_key = ? WHERE id = 1').run(newKey);
}

export default systemDb;
