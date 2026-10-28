import crypto from 'crypto';
import { APP_SECRET_KEY } from '../config';

// Derive a 256-bit AES encryption key using SHA-256 over APP_SECRET_KEY
const VAULT_KEY = crypto.createHash('sha256').update(APP_SECRET_KEY).digest();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Encrypts sensitive text using AES-256-GCM with authenticated tags.
 * Output format: "enc:iv:authTag:ciphertext" (Hex encoded)
 */
export function encryptVaultText(plaintext: string): string {
  if (!plaintext) return '';
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, VAULT_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted text.
 * Falls back gracefully to raw text if not encrypted (backwards compatibility).
 */
export function decryptVaultText(data: string): string {
  if (!data || !data.startsWith('enc:')) {
    return data || '';
  }

  try {
    const parts = data.split(':');
    if (parts.length !== 4) return data;

    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, VAULT_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto Vault] Decryption error, returning sanitized placeholder:', err);
    return '[Encrypted Content]';
  }
}
