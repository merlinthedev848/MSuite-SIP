import Database from 'better-sqlite3';
import { SYSTEM_DB_PATH, DEFAULT_PBX_SERVER, DEFAULT_PBX_PORT, DEFAULT_PBX_TRANSPORT, SERVER_DOMAIN, LICENSE_KEY } from '../config';

const systemDb = new Database(SYSTEM_DB_PATH);
systemDb.pragma('journal_mode = WAL');

// 1. Initialize System Operational Tables (Zero PII)
systemDb.exec(`
  CREATE TABLE IF NOT EXISTS server_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pbx_server TEXT NOT NULL,
    pbx_port INTEGER NOT NULL,
    pbx_transport TEXT NOT NULL,
    data_handler_url TEXT NOT NULL,
    license_key TEXT,
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

export default systemDb;
