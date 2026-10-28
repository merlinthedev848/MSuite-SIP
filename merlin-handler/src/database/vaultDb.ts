import Database from 'better-sqlite3';
import { VAULT_DB_PATH } from '../config';

const vaultDb = new Database(VAULT_DB_PATH);
vaultDb.pragma('journal_mode = WAL');

// Initialize GDPR Communications Vault Tables (PII Protected)
vaultDb.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    content TEXT NOT NULL,
    file_id TEXT,
    file_name TEXT,
    file_size INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_vault_messages_conversation 
    ON messages (conversation_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_vault_messages_sender 
    ON messages (sender_id);

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    department TEXT,
    mobile TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS media_vault_files (
    file_id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    stored_path TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    conversation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gdpr_retention_policy (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    chat_retention_days INTEGER DEFAULT 90,
    media_retention_days INTEGER DEFAULT 90,
    auto_prune_enabled INTEGER DEFAULT 1,
    last_pruned_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS gdpr_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    target_extension TEXT NOT NULL,
    details TEXT,
    certificate_hash TEXT NOT NULL,
    executed_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default retention policy
const checkPolicy = vaultDb.prepare('SELECT id FROM gdpr_retention_policy WHERE id = 1').get();
if (!checkPolicy) {
  vaultDb.prepare(`
    INSERT INTO gdpr_retention_policy (id, chat_retention_days, media_retention_days, auto_prune_enabled)
    VALUES (1, 90, 90, 1)
  `).run();
}

export default vaultDb;
