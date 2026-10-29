import { Response } from 'express';

export type LogCategory = 'DESKPHONE' | 'SOFTPHONE' | 'SOCKET' | 'ROUTER' | 'SECURITY' | 'PBX' | 'SYSTEM' | 'FIRMWARE';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface DeviceLogEvent {
  id: number;
  timestamp: string;
  category: LogCategory;
  level: LogLevel;
  message: string;
  deviceIdentifier?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// High-Performance In-Memory Ring Buffer (O(1) push and constant allocation)
const MAX_RING_BUFFER = 1000;

class RingBuffer<T> {
  private buffer: (T | null)[];
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  toArray(limit?: number): T[] {
    const n = Math.min(this.count, limit && limit > 0 ? limit : this.count);
    const result: T[] = new Array(n);
    let idx = (this.head - n + this.capacity) % this.capacity;
    for (let i = 0; i < n; i++) {
      const item = this.buffer[idx];
      if (item !== null) {
        result[i] = item;
      }
      idx = (idx + 1) % this.capacity;
    }
    return result;
  }

  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }
}

let eventSeq = 1;
const logRingBuffer = new RingBuffer<DeviceLogEvent>(MAX_RING_BUFFER);

// Active Server-Sent Events (SSE) Client Connections
const activeSseClients = new Set<Response>();

export function broadcastDeviceLog(
  category: LogCategory,
  level: LogLevel,
  message: string,
  extra: {
    deviceIdentifier?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  } = {}
): DeviceLogEvent {
  const event: DeviceLogEvent = {
    id: eventSeq++,
    timestamp: new Date().toISOString(),
    category,
    level,
    message,
    deviceIdentifier: extra.deviceIdentifier || '',
    ipAddress: extra.ipAddress || '127.0.0.1',
    userAgent: extra.userAgent || '',
    metadata: extra.metadata || {}
  };

  logRingBuffer.push(event);

  // Push to all active SSE shell subscribers
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of activeSseClients) {
    try {
      client.write(payload);
    } catch {
      activeSseClients.delete(client);
    }
  }

  return event;
}

export function getRecentDeviceLogs(limit: number = 200): DeviceLogEvent[] {
  const n = Math.min(Math.max(1, limit), MAX_RING_BUFFER);
  return logRingBuffer.toArray(n);
}

export function getFilteredDeviceLogs(filter: {
  category?: string;
  device?: string;
  search?: string;
  limit?: number;
}): DeviceLogEvent[] {
  const all = logRingBuffer.toArray();
  const maxLimit = Math.min(Math.max(1, filter.limit || 250), MAX_RING_BUFFER);

  return all.filter(ev => {
    if (filter.category && filter.category !== 'ALL' && ev.category.toUpperCase() !== filter.category.toUpperCase()) {
      return false;
    }
    if (filter.device) {
      const target = filter.device.toLowerCase().replace(/[^a-z0-9]/g, '');
      const dev = (ev.deviceIdentifier || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ip = (ev.ipAddress || '').toLowerCase();
      if (!dev.includes(target) && !ip.includes(filter.device.toLowerCase())) {
        return false;
      }
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const msg = ev.message.toLowerCase();
      const dev = (ev.deviceIdentifier || '').toLowerCase();
      const ip = (ev.ipAddress || '').toLowerCase();
      if (!msg.includes(q) && !dev.includes(q) && !ip.includes(q)) {
        return false;
      }
    }
    return true;
  }).slice(-maxLimit);
}

export function clearDeviceLogs(): void {
  logRingBuffer.clear();
  broadcastDeviceLog('SYSTEM', 'INFO', 'Device connectivity shell buffer cleared by administrator.');
}

export function registerSseClient(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Critical for Nginx proxy buffering disable
    'Access-Control-Allow-Origin': '*'
  });

  // Flush initial connection comment
  res.write(`: CKM-Handler Device Shell Stream Connected\n\n`);

  activeSseClients.add(res);

  res.on('close', () => {
    activeSseClients.delete(res);
  });
}

// Heartbeat interval to prevent idle proxy/NAT timeouts
setInterval(() => {
  if (activeSseClients.size > 0) {
    const ping = `: heartbeat\n\n`;
    for (const client of activeSseClients) {
      try {
        client.write(ping);
      } catch {
        activeSseClients.delete(client);
      }
    }
  }
}, 15000);
