import systemDb from '../database/systemDb';

export const MAX_DEVICE_PROVISION_EVENTS = 40;

export type DeviceProvisionLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
export type DeviceProvisionKind = 'provision' | 'fetch' | 'error' | 'profile';

export interface DeviceProvisionEvent {
  id: number;
  at: string;
  level: DeviceProvisionLevel;
  kind: DeviceProvisionKind;
  message: string;
}

function cleanMac(mac: string): string {
  return String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
}

export function sanitizeProvisionMessage(message: string, redact: string[] = []): string {
  let text = String(message || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  text = text.replace(/password\s*[:=]\s*\S+/gi, 'password=[redacted]');
  for (const secret of redact) {
    if (secret && secret.length >= 4) {
      text = text.split(secret).join('[redacted]');
    }
  }
  return text.slice(0, 400);
}

export function readProvisionEvents(raw: string | null | undefined): DeviceProvisionEvent[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DeviceProvisionEvent => {
      return item && typeof item.id === 'number' && typeof item.message === 'string' && typeof item.at === 'string';
    });
  } catch {
    return [];
  }
}

export function appendProvisionEvent(
  raw: string | null | undefined,
  event: { level: DeviceProvisionLevel; kind: DeviceProvisionKind; message: string },
  redact: string[] = []
): string {
  const events = readProvisionEvents(raw);
  const nextId = events.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  events.push({
    id: nextId,
    at: new Date().toISOString(),
    level: event.level,
    kind: event.kind,
    message: sanitizeProvisionMessage(event.message, redact)
  });
  const capped = events.length > MAX_DEVICE_PROVISION_EVENTS
    ? events.slice(events.length - MAX_DEVICE_PROVISION_EVENTS)
    : events;
  return JSON.stringify(capped);
}

function updateLog(table: 'physical_handsets' | 'discovered_devices', mac: string, next: string): void {
  const sql = table === 'physical_handsets'
    ? `UPDATE physical_handsets SET provision_log = ? WHERE LOWER(REPLACE(mac_address, ':', '')) = ?`
    : `UPDATE discovered_devices SET provision_log = ? WHERE LOWER(REPLACE(mac_address, ':', '')) = ?`;
  systemDb.prepare(sql).run(next, mac);
}

function readLog(table: 'physical_handsets' | 'discovered_devices', mac: string): string | null {
  const sql = table === 'physical_handsets'
    ? `SELECT provision_log FROM physical_handsets WHERE LOWER(REPLACE(mac_address, ':', '')) = ?`
    : `SELECT provision_log FROM discovered_devices WHERE LOWER(REPLACE(mac_address, ':', '')) = ?`;
  const row = systemDb.prepare(sql).get(mac) as { provision_log?: string | null } | undefined;
  if (!row) return null;
  return row.provision_log || '[]';
}

/**
 * Append a provision/fetch/error event onto that device's own record.
 * Handsets keep the log on physical_handsets. A phone that has only been
 * discovered keeps it on discovered_devices. Nothing is written to the shared shell buffer.
 */
export function recordDeviceProvisionEvent(
  mac: string,
  event: { level: DeviceProvisionLevel; kind: DeviceProvisionKind; message: string },
  redact: string[] = []
): void {
  const clean = cleanMac(mac);
  if (clean.length !== 12) return;
  try {
    const handsetLog = readLog('physical_handsets', clean);
    if (handsetLog !== null) {
      updateLog('physical_handsets', clean, appendProvisionEvent(handsetLog, event, redact));
      return;
    }
    const discoveredLog = readLog('discovered_devices', clean);
    if (discoveredLog !== null) {
      updateLog('discovered_devices', clean, appendProvisionEvent(discoveredLog, event, redact));
    }
  } catch {
    // A log write must not break the provision response.
  }
}

export function readDeviceProvisionLog(mac: string, limit = 40): {
  store: 'physical_handsets' | 'discovered_devices';
  logs: DeviceProvisionEvent[];
} | null {
  const clean = cleanMac(mac);
  if (clean.length !== 12) return null;
  const handsetLog = readLog('physical_handsets', clean);
  if (handsetLog !== null) {
    const logs = readProvisionEvents(handsetLog).slice(-Math.max(1, Math.min(limit, MAX_DEVICE_PROVISION_EVENTS)));
    return { store: 'physical_handsets', logs };
  }
  const discoveredLog = readLog('discovered_devices', clean);
  if (discoveredLog !== null) {
    const logs = readProvisionEvents(discoveredLog).slice(-Math.max(1, Math.min(limit, MAX_DEVICE_PROVISION_EVENTS)));
    return { store: 'discovered_devices', logs };
  }
  return null;
}

/** When a discovered phone is adopted, keep its existing fault log on the new handset row. */
export function takeDiscoveredProvisionLog(mac: string): string {
  const clean = cleanMac(mac);
  if (clean.length !== 12) return '[]';
  try {
    const discoveredLog = readLog('discovered_devices', clean);
    return discoveredLog && discoveredLog !== '[]' ? discoveredLog : '[]';
  } catch {
    return '[]';
  }
}
