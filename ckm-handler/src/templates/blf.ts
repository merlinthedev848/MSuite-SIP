export interface StoredBlfKey {
  key: number;
  extension: string;
  label: string;
}

const EXTENSION_RE = /^\d{2,10}$/;

/**
 * Keys saved from the fleet form. Empty rows are skipped. A bad extension is rejected
 * so a typo does not land in the file the phone boots.
 */
export function sanitizeBlfKeys(raw: unknown): { ok: true; keys: StoredBlfKey[] } | { ok: false; error: string } {
  if (raw == null || raw === '') {
    return { ok: true, keys: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'blfKeys must be a list of extension, label, and key index.' };
  }
  if (raw.length > 40) {
    return { ok: false, error: 'A handset can have at most 40 busy-lamp keys.' };
  }

  const keys: StoredBlfKey[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { extension?: unknown; label?: unknown; key?: unknown };
    const extension = String(record.extension || '').trim();
    if (!extension) continue;
    if (!EXTENSION_RE.test(extension)) {
      return { ok: false, error: `BLF target ${extension} must be 2 to 10 digits.` };
    }
    const label = String(record.label || extension).replace(/[\r\n<>]/g, ' ').trim().slice(0, 32);
    let key = Number(record.key);
    if (!Number.isInteger(key) || key < 1 || key > 60) {
      key = keys.length + 1;
    }
    keys.push({ key, extension, label: label || extension });
  }
  return { ok: true, keys };
}
