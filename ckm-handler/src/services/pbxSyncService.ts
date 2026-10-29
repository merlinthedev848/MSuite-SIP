import net from 'net';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import systemDb, { logActivity } from '../database/systemDb';
import { ServerConfigRow } from '../types/models';
import { broadcastDeviceLog } from './telemetryStream';

export interface PbxSyncConfig {
  type?: 'yeastar_api' | 'yeastar_ami' | 'asterisk_ami' | 'freepbx_ami' | 'grandstream_api';
  host: string;
  port: number;
  username: string;
  secret: string;
  protocol?: 'http' | 'https';
  apiPath?: string;
}

// Backwards-compatible alias for existing callers
export type AmiConfig = PbxSyncConfig;

export interface SyncedExtension {
  extension: string;
  displayName: string;
  username: string;
  password?: string;
  status?: string;
}

/**
 * Universal PBX Extension Synchronization Dispatcher
 */
export async function syncExtensionsFromPbx(
  config: PbxSyncConfig
): Promise<{ success: boolean; count: number; message: string }> {
  const pbxType = config.type || (config.port === 5038 ? 'asterisk_ami' : 'yeastar_api');
  broadcastDeviceLog('PBX', 'INFO', `PBX extension sync triggered for ${config.host}:${config.port} (${pbxType})`, {
    deviceIdentifier: config.host,
    metadata: { pbxType, port: config.port }
  });

  if (pbxType === 'yeastar_api') {
    return syncExtensionsFromYeastarApi(config);
  }

  // Asterisk AMI / Yeastar AMI
  return syncExtensionsFromAsterisk(config);
}

/**
 * Helper to make HTTP/HTTPS JSON requests to PBX APIs (supports self-signed SSL)
 */
function pbxHttpRequest(
  protocol: string,
  host: string,
  port: number,
  path: string,
  method: string,
  payload?: any,
  token?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const isHttps = protocol === 'https';
    const lib = isHttps ? https : http;
    const bodyStr = payload ? JSON.stringify(payload) : '';

    let urlPath = path;
    if (token) {
      urlPath += (urlPath.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    }

    const options: https.RequestOptions = {
      hostname: host,
      port: port,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      },
      timeout: 12000,
      rejectUnauthorized: false // Support on-prem self-signed PBX certificates
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ raw: data, status: 'Error', error: 'Invalid response from PBX: ' + data.substring(0, 160) });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Connection to PBX at ${host}:${port} timed out after 12 seconds.`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * Yeastar S-Series / P-Series REST API Sync (API v2.0.0 / OpenAPI)
 */
export async function syncExtensionsFromYeastarApi(
  config: PbxSyncConfig
): Promise<{ success: boolean; count: number; message: string }> {
  const host = config.host.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  const protocol = config.protocol || (config.port === 443 ? 'https' : 'https');
  const port = config.port || 8260;
  const rawPath = config.apiPath ? config.apiPath.trim() : 'api/v2.0.0';
  const basePath = '/' + rawPath.replace(/^\/+|\/+$/g, '');

  // Yeastar requires MD5 of password (in lowercase)
  let pw = config.secret.trim();
  if (!/^[a-f0-9]{32}$/i.test(pw)) {
    pw = crypto.createHash('md5').update(pw).digest('hex').toLowerCase();
  } else {
    pw = pw.toLowerCase();
  }

  // 1. Authenticate with Yeastar API
  let loginRes: any;
  let activeProto = protocol;

  try {
    loginRes = await pbxHttpRequest(activeProto, host, port, `${basePath}/login`, 'POST', {
      username: config.username,
      password: pw,
      version: '2.0.0'
    });
  } catch (err: any) {
    // If HTTPS failed, try HTTP as graceful fallback
    if (activeProto === 'https') {
      try {
        loginRes = await pbxHttpRequest('http', host, port, `${basePath}/login`, 'POST', {
          username: config.username,
          password: pw,
          version: '2.0.0'
        });
        activeProto = 'http';
      } catch {
        return { success: false, count: 0, message: `Failed to connect to Yeastar API at ${host}:${port}: ${err.message}` };
      }
    } else {
      return { success: false, count: 0, message: `Failed to connect to Yeastar API at ${host}:${port}: ${err.message}` };
    }
  }

  // Check login status
  if (!loginRes || (loginRes.status !== 'Success' && !loginRes.token)) {
    const errMsg = loginRes?.error || loginRes?.message || loginRes?.raw || 'Invalid username or password.';
    return { success: false, count: 0, message: `Yeastar API login failed: ${errMsg}` };
  }

  const token = loginRes.token;

  // 2. Fetch Extension List
  let extRes: any;
  try {
    extRes = await pbxHttpRequest(activeProto, host, port, `${basePath}/extension/list`, 'POST', {}, token);
  } catch (err: any) {
    return { success: false, count: 0, message: `Failed to fetch extension list from Yeastar PBX: ${err.message}` };
  }

  const extlist = extRes?.extlist || extRes?.data || [];
  if (!Array.isArray(extlist) || extlist.length === 0) {
    return { success: true, count: 0, message: 'Connected to Yeastar PBX via REST API, but no extensions were returned.' };
  }

  const extensions: SyncedExtension[] = [];
  for (const item of extlist) {
    const extNumber = String(item.number || item.extid || item.extension || '').trim();
    if (!extNumber || !/^\d{2,8}$/.test(extNumber)) continue;

    const displayName = String(item.username || item.name || item.callerid || `Extension ${extNumber}`).trim();
    const sipPassword = String(item.user_password || item.password || item.registration_password || 'ExtPassword123!').trim();

    extensions.push({
      extension: extNumber,
      username: extNumber,
      displayName: displayName,
      password: sipPassword
    });
  }

  if (extensions.length === 0) {
    return { success: true, count: 0, message: 'Connected to Yeastar PBX, but 0 valid extension numbers could be parsed.' };
  }

  // 3. Insert or update in system.db
  const syncTx = systemDb.transaction((exts: SyncedExtension[]) => {
    const stmt = systemDb.prepare(`
      INSERT INTO extensions (extension, sip_username, sip_password, display_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(extension) DO UPDATE SET
        display_name = excluded.display_name
    `);
    for (const ext of exts) {
      stmt.run(ext.extension, ext.username, ext.password || 'ExtPassword123!', ext.displayName);
    }
  });

  syncTx(extensions);

  return {
    success: true,
    count: extensions.length,
    message: `Successfully synced ${extensions.length} extension(s) from Yeastar PBX (REST API).`
  };
}

/**
 * Connects to Asterisk Manager Interface (AMI) on port 5038 and fetches all configured SIP extensions.
 * Includes support for Yeastar Asterisk AMI with CLI and ExtensionState fallbacks.
 */
export async function syncExtensionsFromAsterisk(
  ami: PbxSyncConfig
): Promise<{ success: boolean; count: number; message: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let loggedIn = false;
    let timeoutTimer: NodeJS.Timeout;
    let collectTimer: NodeJS.Timeout | null = null;
    let completed = false;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (collectTimer) clearTimeout(collectTimer);
      socket.removeAllListeners();
      socket.destroy();
    };

    const finish = () => {
      if (completed) return;
      completed = true;
      const found = parseAmiOutput(buffer);
      cleanup();

      if (found.length === 0) {
        resolve({ success: true, count: 0, message: 'Connected to PBX via AMI, but no SIP extensions were returned.' });
        return;
      }

      // Insert or update into system.db in a single ACID transaction
      const syncTx = systemDb.transaction((exts: SyncedExtension[]) => {
        const stmt = systemDb.prepare(`
          INSERT INTO extensions (extension, sip_username, sip_password, display_name)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(extension) DO UPDATE SET
            display_name = excluded.display_name
        `);
        for (const ext of exts) {
          stmt.run(ext.extension, ext.username, ext.password || 'ExtPassword123!', ext.displayName);
        }
      });

      syncTx(found);
      const added = found.length;

      resolve({
        success: true,
        count: added,
        message: `Successfully synced ${added} extension(s) from Asterisk/PBX AMI.`
      });
    };

    timeoutTimer = setTimeout(() => {
      if (!completed) {
        cleanup();
        resolve({ success: false, count: 0, message: 'AMI connection to PBX timed out after 10 seconds.' });
      }
    }, 10000);

    socket.connect(ami.port || 5038, ami.host, () => {
      console.log(`[PBX Sync] Connected to Asterisk AMI at ${ami.host}:${ami.port}`);
    });

    socket.on('data', (data) => {
      buffer += data.toString('utf-8');

      // 1. Initial Greeting: Send Login
      if (buffer.includes('Asterisk Call Manager') && !loggedIn) {
        loggedIn = true;
        socket.write(`Action: Login\r\nUsername: ${ami.username}\r\nSecret: ${ami.secret}\r\nEvents: off\r\n\r\n`);
        buffer = '';
        return;
      }

      // 2. Login Response
      if (buffer.includes('Response: Success') && buffer.includes('Message: Authentication accepted')) {
        buffer = '';
        // Send queries for PJSIP, SIP peers, and CLI command fallback
        socket.write(`Action: SIPpeers\r\n\r\n`);
        socket.write(`Action: PJSIPShowEndpoints\r\n\r\n`);
        socket.write(`Action: ExtensionStateList\r\n\r\n`);
        socket.write(`Action: Command\r\nCommand: sip show peers\r\n\r\n`);
        socket.write(`Action: Command\r\nCommand: pjsip show endpoints\r\n\r\n`);

        // Debounce timer: wait 1.2s to collect all incoming event chunks
        if (collectTimer) clearTimeout(collectTimer);
        collectTimer = setTimeout(finish, 1500);
        return;
      }

      // If we are logged in, extend collection timer slightly on new packets
      if (loggedIn) {
        if (collectTimer) clearTimeout(collectTimer);
        collectTimer = setTimeout(finish, 1200);

        // Immediate complete if both peer and endpoint detail complete
        if (buffer.includes('Event: PeerlistComplete') && buffer.includes('Event: EndpointDetailComplete')) {
          finish();
        }
      }
    });

    socket.on('error', (err) => {
      if (!completed) {
        cleanup();
        resolve({ success: false, count: 0, message: `AMI Connection error: ${err.message}` });
      }
    });
  });
}

function parseAmiOutput(raw: string): SyncedExtension[] {
  const extensions: SyncedExtension[] = [];
  const lines = raw.split(/\r?\n/);
  let currentExt = '';
  let currentName = '';

  const addExt = (ext: string, name: string) => {
    const cleanExt = ext.trim().replace(/^SIP\//, '').replace(/^PJSIP\//, '');
    if (/^\d{2,8}$/.test(cleanExt)) {
      if (!extensions.some(e => e.extension === cleanExt)) {
        extensions.push({
          extension: cleanExt,
          username: cleanExt,
          displayName: name || `Extension ${cleanExt}`
        });
      }
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. Structured AMI Header Fields
    if (trimmed.startsWith('ObjectName:') || trimmed.startsWith('Peer:')) {
      const parts = trimmed.split(':');
      currentExt = parts[1]?.trim().replace(/^SIP\//, '') || '';
    } else if (trimmed.startsWith('Callerid:') || trimmed.startsWith('Description:')) {
      const parts = trimmed.split(':');
      currentName = parts.slice(1).join(':').trim().replace(/["<>]/g, '') || '';
    } else if (trimmed.startsWith('Exten:')) {
      const parts = trimmed.split(':');
      const ext = parts[1]?.trim() || '';
      addExt(ext, `Extension ${ext}`);
    }

    if (currentExt && /^\d{2,8}$/.test(currentExt)) {
      addExt(currentExt, currentName);
      currentExt = '';
      currentName = '';
    }

    // 2. Asterisk CLI "sip show peers" table parsing fallback
    // e.g.: "1001/1001   10.0.0.50  D  Yes  Yes  5060  OK (15 ms)  Alice"
    const cliPeerMatch = trimmed.match(/^(\d{2,8})(?:\/\d+)?\s+/);
    if (cliPeerMatch) {
      const ext = cliPeerMatch[1];
      // Try extracting name from trailing text if present
      const tokens = trimmed.split(/\s+/);
      const possibleName = tokens.length > 5 ? tokens.slice(6).join(' ') : '';
      addExt(ext, possibleName || `Extension ${ext}`);
    }

    // 3. Asterisk CLI "pjsip show endpoints" table parsing fallback
    // e.g.: "Endpoint:  1001/1001  Not in use  0 of inf"
    const cliEndpointMatch = trimmed.match(/^Endpoint:\s*(\d{2,8})(?:\/\d+)?/i);
    if (cliEndpointMatch) {
      const ext = cliEndpointMatch[1];
      addExt(ext, `Extension ${ext}`);
    }
  }

  return extensions;
}

// ==============================================================================
// Autonomous Background PBX Synchronization Daemon (Omada / GenieACS style)
// ==============================================================================
let pbxSyncTimer: NodeJS.Timeout | null = null;

export function startPbxSyncDaemon(): void {
  if (pbxSyncTimer) return;
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined;
  const mins = config?.auto_sync_interval_mins || 5;
  const isEnabled = config?.auto_sync_enabled !== 0;

  setTimeout(runAutoPbxSync, 15000);
  if (isEnabled) {
    pbxSyncTimer = setInterval(runAutoPbxSync, mins * 60 * 1000);
    console.log(`[PBX Sync Engine] Autonomous background synchronization daemon active (${mins}m interval)`);
  }
}

export function updatePbxSyncSchedule(intervalMins?: number, enabled?: boolean): void {
  if (pbxSyncTimer) {
    clearInterval(pbxSyncTimer);
    pbxSyncTimer = null;
  }
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined;
  const isEnabled = enabled !== undefined ? enabled : (config?.auto_sync_enabled === 1);
  const mins = intervalMins && intervalMins > 0 ? intervalMins : (config?.auto_sync_interval_mins || 5);

  if (isEnabled) {
    const ms = Math.max(1, Math.min(1440, mins)) * 60 * 1000;
    pbxSyncTimer = setInterval(runAutoPbxSync, ms);
    console.log(`[PBX Sync Engine] Autonomous background sync rescheduled to ${mins}m interval.`);
  } else {
    console.log('[PBX Sync Engine] Autonomous background sync paused.');
  }
}

export async function runAutoPbxSync(): Promise<void> {
  try {
    const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined;
    if (!config || config.auto_sync_enabled === 0) return;
    if (!config.pbx_server || config.pbx_server === '127.0.0.1' || config.pbx_server === 'localhost') return;

    const syncConfig: PbxSyncConfig = {
      type: 'asterisk_ami',
      host: config.pbx_server,
      port: 5038,
      username: 'admin',
      secret: ''
    };

    const res = await syncExtensionsFromPbx(syncConfig);
    const now = new Date().toISOString();
    systemDb.prepare(`
      UPDATE server_config 
      SET last_sync_at = ?, last_sync_status = ? 
      WHERE id = 1
    `).run(now, res.success ? 'SUCCESS' : 'FAILED');

    if (res.success) {
      broadcastDeviceLog('PBX', 'SUCCESS', `Autonomous PBX sync completed: ${res.count} extension(s) synchronized.`, {
        deviceIdentifier: config.pbx_server,
        metadata: { count: res.count }
      });
      if (res.count > 0) {
        logActivity('PBX_AUTO_SYNC', `Autonomous PBX sync completed: ${res.count} extension(s) synchronized.`, '127.0.0.1');
      }
    } else {
      broadcastDeviceLog('PBX', 'WARN', `Autonomous PBX sync check: ${res.message || 'No new extensions discovered'}`, {
        deviceIdentifier: config.pbx_server
      });
    }
  } catch (err: any) {
    broadcastDeviceLog('PBX', 'ERROR', `Autonomous PBX sync failed: ${err?.message || 'Connection error'}`, {
      deviceIdentifier: 'PBX Core'
    });
  }
}
