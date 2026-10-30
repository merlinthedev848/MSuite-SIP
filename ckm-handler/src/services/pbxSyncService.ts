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
  verifySsl?: boolean;
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
  payload?: unknown,
  token?: string,
  verifySsl: boolean = false
): Promise<Record<string, any>> {
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
        'Host': host,
        ...(token ? { 'token': token, 'Authorization': `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      },
      timeout: 15000,
      rejectUnauthorized: verifySsl,
      ...(isHttps ? {
        ciphers: 'DEFAULT:@SECLEVEL=1:ALL',
        minVersion: 'TLSv1'
      } : {})
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
      reject(new Error(`Connection to PBX at ${host}:${port} timed out after 15 seconds.`));
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
  const verifySsl = Boolean(config.verifySsl);

  // Yeastar requires MD5 of password (in lowercase)
  let pw = config.secret.trim();
  if (!/^[a-f0-9]{32}$/i.test(pw)) {
    pw = crypto.createHash('md5').update(pw).digest('hex').toLowerCase();
  } else {
    pw = pw.toLowerCase();
  }

  // 1. Authenticate with Yeastar API with smart port & protocol auto-detection
  let loginRes: Record<string, any> | undefined;
  let activeProto = protocol;
  let activePort = port;

  const candidatePorts = [port];
  if (port === 8260) candidatePorts.push(8088, 443);
  else if (port === 8088) candidatePorts.push(8260, 443);
  else if (port === 443) candidatePorts.push(8088, 8260);

  let lastErr: Error | unknown = null;
  for (const p of candidatePorts) {
    try {
      loginRes = await pbxHttpRequest(activeProto, host, p, `${basePath}/login`, 'POST', {
        username: config.username,
        password: pw,
        version: '2.0.0'
      }, undefined, verifySsl);
      activePort = p;
      lastErr = null;
      break;
    } catch (err: unknown) {
      lastErr = err;
      if (activeProto === 'https') {
        try {
          loginRes = await pbxHttpRequest('http', host, p, `${basePath}/login`, 'POST', {
            username: config.username,
            password: pw,
            version: '2.0.0'
          }, undefined, verifySsl);
          activeProto = 'http';
          activePort = p;
          lastErr = null;
          break;
        } catch {}
      }
    }
  }

  // Check login status
  if (!loginRes || (loginRes.status !== 'Success' && !loginRes.token)) {
    if (lastErr) {
      return { success: false, count: 0, message: `Failed to connect to Yeastar API at ${host}:${activePort}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}` };
    }
    const errMsg = loginRes?.error || loginRes?.message || loginRes?.errmsg || loginRes?.raw || 'Invalid username or password.';
    return { success: false, count: 0, message: `Yeastar API login failed on ${host}:${activePort}: ${errMsg}` };
  }

  const token = loginRes.token;

  // 2. Fetch Extension List
  // Yeastar S-Series & P-Series support extension/query with number: 'all', returning extinfos
  let extlist: Record<string, any>[] = [];
  try {
    const queryRes = await pbxHttpRequest(activeProto, host, activePort, `${basePath}/extension/query`, 'POST', { number: 'all' }, token, verifySsl);
    if (queryRes && Array.isArray(queryRes.extinfos) && queryRes.extinfos.length > 0) {
      extlist = queryRes.extinfos;
    } else if (queryRes && Array.isArray(queryRes.extlist) && queryRes.extlist.length > 0) {
      extlist = queryRes.extlist;
    } else if (queryRes && Array.isArray(queryRes.data) && queryRes.data.length > 0) {
      extlist = queryRes.data;
    }
  } catch {
    // fallback
  }

  // Fallback 1: extension/list
  if (extlist.length === 0) {
    try {
      const listRes = await pbxHttpRequest(activeProto, host, activePort, `${basePath}/extension/list`, 'POST', {}, token, verifySsl);
      extlist = listRes?.extlist || listRes?.extinfos || listRes?.data || [];
    } catch {
      // fallback
    }
  }

  // Fallback 2: OpenAPI v1 extensions endpoint
  if (extlist.length === 0) {
    try {
      const v1Res = await pbxHttpRequest(activeProto, host, port, '/api/v1.0/extensions', 'GET', undefined, token, verifySsl);
      extlist = v1Res?.data || v1Res?.extensions || [];
    } catch {
      // ignore
    }
  }

  if (!Array.isArray(extlist) || extlist.length === 0) {
    return { success: true, count: 0, message: 'Connected to Yeastar PBX via REST API, but no extensions were returned.' };
  }

  const extensions: SyncedExtension[] = [];
  for (const item of extlist) {
    const extNumber = String(item.number || item.extnumber || item.extid || item.extension || '').trim();
    if (!extNumber || !/^\d{2,8}$/.test(extNumber)) continue;

    const displayName = String(item.username || item.displayname || item.name || item.callerid || `Extension ${extNumber}`).trim();
    const sipPassword = String(item.user_password || item.password || item.registration_password || item.registerpassword || 'ExtPassword123!').trim();

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
        display_name = excluded.display_name,
        sip_password = CASE WHEN excluded.sip_password != 'ExtPassword123!' THEN excluded.sip_password ELSE extensions.sip_password END
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
        resolve({ success: true, count: 0, message: 'Connected to PBX via AMI, but no SIP extensions were returned. Check AMI user permissions or switch to Yeastar REST API.' });
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

      // 1. Initial Greeting: Send Login WITH Events: on
      if (buffer.includes('Asterisk Call Manager') && !loggedIn) {
        loggedIn = true;
        socket.write(`Action: Login\r\nUsername: ${ami.username}\r\nSecret: ${ami.secret}\r\nEvents: on\r\n\r\n`);
        buffer = '';
        return;
      }

      // 2. Login Response
      if (buffer.includes('Response: Success') && buffer.includes('Message: Authentication accepted')) {
        buffer = '';
        // Send queries for ExtensionState, PJSIP, SIP peers, Status, and CLI command fallbacks
        socket.write(`Action: ExtensionStateList\r\n\r\n`);
        socket.write(`Action: SIPpeers\r\n\r\n`);
        socket.write(`Action: PJSIPShowEndpoints\r\n\r\n`);
        socket.write(`Action: Status\r\n\r\n`);
        socket.write(`Action: Command\r\nCommand: sip show peers\r\n\r\n`);
        socket.write(`Action: Command\r\nCommand: pjsip show endpoints\r\n\r\n`);
        socket.write(`Action: Command\r\nCommand: core show hints\r\n\r\n`);

        // Debounce timer: wait 1.8s to collect all incoming event chunks
        if (collectTimer) clearTimeout(collectTimer);
        collectTimer = setTimeout(finish, 1800);
        return;
      }

      // If login error received
      if (buffer.includes('Response: Error')) {
        const errorLine = buffer.split(/\r?\n/).find(l => l.startsWith('Message:')) || 'AMI authentication failed';
        cleanup();
        const rawMsg = errorLine.replace('Message:', '').trim();
        const hint = rawMsg.toLowerCase().includes('authentication failed')
          ? `AMI Authentication failed for user "${ami.username}". Verify this user exists in Asterisk /etc/asterisk/manager.conf (or FreePBX 'Asterisk Manager Users') with the correct secret and permit IP.`
          : rawMsg;
        resolve({ success: false, count: 0, message: hint });
        return;
      }

      // If we are logged in, extend collection timer slightly on new packets
      if (loggedIn) {
        if (collectTimer) clearTimeout(collectTimer);
        collectTimer = setTimeout(finish, 1400);

        // Immediate complete if peerlist or endpoint list complete
        if (buffer.includes('Event: PeerlistComplete') || buffer.includes('Event: EndpointDetailComplete') || buffer.includes('Event: ExtensionStatusComplete')) {
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
    const cleanExt = ext.trim().replace(/^SIP\//i, '').replace(/^PJSIP\//i, '');
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
      currentExt = parts[1]?.trim().replace(/^SIP\//i, '').replace(/^PJSIP\//i, '') || '';
    } else if (trimmed.startsWith('Callerid:') || trimmed.startsWith('Description:')) {
      const parts = trimmed.split(':');
      currentName = parts.slice(1).join(':').trim().replace(/["<>]/g, '') || '';
    } else if (trimmed.startsWith('Exten:')) {
      const parts = trimmed.split(':');
      const ext = parts[1]?.trim() || '';
      addExt(ext, `Extension ${ext}`);
    } else if (trimmed.startsWith('CallerIDNum:')) {
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

    // 4. Asterisk CLI "core show hints" parsing
    // e.g.: "101@ext-local   : PJSIP/101  State:Idle"
    const hintMatch = trimmed.match(/^(\d{2,8})@/);
    if (hintMatch) {
      addExt(hintMatch[1], `Extension ${hintMatch[1]}`);
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
    pbxSyncTimer.unref();
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
    pbxSyncTimer.unref();
    console.log(`[PBX Sync Engine] Autonomous background sync rescheduled to ${mins}m interval.`);
  } else {
    console.log('[PBX Sync Engine] Autonomous background sync paused.');
  }
}

export async function runAutoPbxSync(): Promise<void> {
  try {
    const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined;
    if (!config || config.auto_sync_enabled === 0) return;
    const targetHost = config.api_host || config.pbx_server;
    if (!targetHost || targetHost === '127.0.0.1' || targetHost === 'localhost') return;

    const syncType = (config.pbx_type || 'yeastar_api') as any;
    const syncConfig: PbxSyncConfig = {
      type: syncType,
      host: targetHost,
      port: config.api_port || (syncType === 'yeastar_api' ? 8260 : 5038),
      username: config.api_user || 'perfexapi',
      secret: config.api_secret || '',
      protocol: (config.api_protocol || 'https') as any,
      apiPath: config.api_path || 'api/v2.0.0',
      verifySsl: Boolean(config.verify_ssl)
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
        deviceIdentifier: targetHost,
        metadata: { count: res.count }
      });
      if (res.count > 0) {
        logActivity('PBX_AUTO_SYNC', `Autonomous PBX sync completed: ${res.count} extension(s) synchronized.`, '127.0.0.1');
      }
    } else {
      broadcastDeviceLog('PBX', 'WARN', `Autonomous PBX sync check: ${res.message || 'No new extensions discovered'}`, {
        deviceIdentifier: targetHost
      });
    }
  } catch (err: unknown) {
    broadcastDeviceLog('PBX', 'ERROR', `Autonomous PBX sync failed: ${err instanceof Error ? err.message : 'Connection error'}`, {
      deviceIdentifier: 'PBX Core'
    });
  }
}

export function stopPbxSyncDaemon(): void {
  if (pbxSyncTimer) {
    clearInterval(pbxSyncTimer);
    pbxSyncTimer = null;
  }
}
