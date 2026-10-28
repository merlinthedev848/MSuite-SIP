import { Response } from 'express';

export type LogCategory = 'DESKPHONE' | 'SOFTPHONE' | 'SOCKET' | 'ROUTER' | 'SECURITY' | 'PBX' | 'SYSTEM';
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
  metadata?: Record<string, any>;
}

// In-Memory Ring Buffer (Preserves latest 1000 live connectivity events)
const MAX_RING_BUFFER = 1000;
let eventSeq = 1;
const eventBuffer: DeviceLogEvent[] = [];

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
    metadata?: Record<string, any>;
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

  eventBuffer.push(event);
  if (eventBuffer.length > MAX_RING_BUFFER) {
    eventBuffer.shift();
  }

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
  return eventBuffer.slice(-n);
}

export function clearDeviceLogs(): void {
  eventBuffer.length = 0;
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
