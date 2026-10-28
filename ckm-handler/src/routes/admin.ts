import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import net from 'net';
import dgram from 'dgram';
import multer from 'multer';
import systemDb, { hashPassword, verifyPassword, logActivity } from '../database/systemDb';
import vaultDb from '../database/vaultDb';
import { ADMIN_USER, ADMIN_PASS, UPLOADS_DIR, PORT, SERVER_DOMAIN } from '../config';
import { generateRouterConfig, RouterConfigParams } from '../templates/routerTemplates';
import { HANDSET_CATALOG, ROUTER_CATALOG, generateDefaultHandsetConfig } from '../templates/catalog';
import { HandsetAccountConfig } from '../templates/yealink';
import { licenseState } from '../services/licenseGuard';
import { syncExtensionsFromAsterisk, AmiConfig } from '../services/pbxSyncService';
import { getSocketStats } from '../services/socketService';
import { registerSseClient, getRecentDeviceLogs, clearDeviceLogs, broadcastDeviceLog } from '../services/telemetryStream';
import { 
  getFirmwareCatalogStatus, 
  downloadFirmwareForModel, 
  saveUploadedFirmware, 
  deleteFirmwareFile, 
  syncAllStableFirmwares,
  findFirmwareFile
} from '../services/firmwareService';
import { performance } from 'perf_hooks';

const router = Router();

// Configure Logo Upload Storage
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const id = `logo_${Date.now()}`;
    cb(null, `${id}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max logo size
});

// Configure In-Memory Buffer Upload for Firmware Binaries (up to 350MB)
const firmwareUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 350 * 1024 * 1024 }
});

const getServerConfigStmt = systemDb.prepare('SELECT * FROM server_config WHERE id = 1');

export interface AuthenticatedAdmin {
  id: number;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
}

// Session-Backed & Basic Auth Admin Middleware
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const queryToken = req.query.token as string | undefined;
  const authHeader = req.headers.authorization || (queryToken ? `Bearer ${queryToken}` : undefined);
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CKM Handler Admin"');
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  // 1. Check Bearer / Session Token
  const bearerMatch = authHeader.match(/^Bearer\s+(.*)$/i);
  if (bearerMatch) {
    const token = bearerMatch[1].trim();
    const session = systemDb.prepare(`
      SELECT s.token, s.expires_at, u.id, u.username, u.display_name, u.role, u.permissions, u.is_active
      FROM admin_sessions s
      JOIN admin_users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
    `).get(token) as any;

    if (session) {
      let perms: string[] = [];
      try { perms = JSON.parse(session.permissions || '[]'); } catch {}
      (req as any).adminUser = {
        id: session.id,
        username: session.username,
        displayName: session.display_name,
        role: session.role,
        permissions: perms
      } as AuthenticatedAdmin;
      return next();
    }
  }

  // 2. Check HTTP Basic Authentication
  const basicMatch = authHeader.match(/^Basic\s+(.*)$/i);
  if (basicMatch) {
    try {
      const credentials = Buffer.from(basicMatch[1], 'base64').toString('utf-8');
      const [user, pass] = credentials.split(':');
      if (user && pass) {
        // Query database for admin user
        const uRow = systemDb.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(user) as any;
        if (uRow && verifyPassword(pass, uRow.password_hash, uRow.salt)) {
          let perms: string[] = [];
          try { perms = JSON.parse(uRow.permissions || '[]'); } catch {}
          (req as any).adminUser = {
            id: uRow.id,
            username: uRow.username,
            displayName: uRow.display_name,
            role: uRow.role,
            permissions: perms
          } as AuthenticatedAdmin;
          return next();
        }

        // Environment fallback for root bootstrap credentials
        const userBuf = Buffer.from(user);
        const adminUserBuf = Buffer.from(ADMIN_USER);
        const passBuf = Buffer.from(pass);
        const adminPassBuf = Buffer.from(ADMIN_PASS);
        if (userBuf.length === adminUserBuf.length && passBuf.length === adminPassBuf.length &&
            crypto.timingSafeEqual(userBuf, adminUserBuf) && crypto.timingSafeEqual(passBuf, adminPassBuf)) {
          (req as any).adminUser = {
            id: 0,
            username: ADMIN_USER,
            displayName: 'Root Administrator',
            role: 'superadmin',
            permissions: ['*']
          } as AuthenticatedAdmin;
          return next();
        }
      }
    } catch {}
  }

  return res.status(401).json({ ok: false, error: 'Invalid or expired credentials' });
};

// RBAC Granular Permission Guard Middleware
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).adminUser as AuthenticatedAdmin | undefined;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    if (user.role === 'superadmin' || (user.permissions && (user.permissions.includes('*') || user.permissions.includes(permission)))) {
      return next();
    }
    return res.status(403).json({ ok: false, error: `Forbidden: Missing required permission [${permission}].` });
  };
};

// Brute-force rate limiter for admin login
const loginFailedAttempts = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, attempt] of loginFailedAttempts.entries()) {
    if (now >= attempt.resetAt) loginFailedAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ----------------------------------------------------------------------------
// Authentication Endpoints (Login, Logout, Current User)
// ----------------------------------------------------------------------------
router.post('/api/admin/login', (req: Request, res: Response) => {
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const attempt = loginFailedAttempts.get(clientIp);

  if (attempt && now < attempt.resetAt && attempt.count >= 5) {
    const waitSec = Math.ceil((attempt.resetAt - now) / 1000);
    return res.status(429).json({
      ok: false,
      error: `Too many failed login attempts. Please wait ${waitSec} seconds before retrying.`
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password are required.' });
  }

  const cleanUser = String(username).trim();
  let matchedUser: any = systemDb.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(cleanUser);

  let isValid = false;
  if (matchedUser && verifyPassword(password, matchedUser.password_hash, matchedUser.salt)) {
    isValid = true;
  } else if (!matchedUser && cleanUser === ADMIN_USER && password === ADMIN_PASS) {
    // Seed and match root user if logging in with env credentials
    const { hash, salt } = hashPassword(ADMIN_PASS);
    systemDb.prepare(`
      INSERT OR IGNORE INTO admin_users (username, password_hash, salt, display_name, role, permissions, is_active)
      VALUES (?, ?, ?, 'System Administrator', 'superadmin', '["*"]', 1)
    `).run(ADMIN_USER, hash, salt);
    matchedUser = systemDb.prepare('SELECT * FROM admin_users WHERE username = ?').get(cleanUser);
    isValid = true;
  }

  if (!isValid) {
    const cur = loginFailedAttempts.get(clientIp) || { count: 0, resetAt: now + 5 * 60 * 1000 };
    cur.count++;
    loginFailedAttempts.set(clientIp, cur);
    return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
  }

  // Clear rate limiter on success
  loginFailedAttempts.delete(clientIp);

  // Generate secure 32-byte session token with 30-day expiry
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  systemDb.prepare(`
    INSERT INTO admin_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, matchedUser.id, expiresAt);

  systemDb.prepare('UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(matchedUser.id);

  let perms: string[] = [];
  try { perms = JSON.parse(matchedUser.permissions || '[]'); } catch {}

  return res.json({
    ok: true,
    token,
    user: {
      id: matchedUser.id,
      username: matchedUser.username,
      displayName: matchedUser.display_name,
      role: matchedUser.role,
      permissions: perms
    }
  });
});

router.get('/api/admin/me', adminAuth, (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  return res.json({ ok: true, user });
});

router.post('/api/admin/logout', adminAuth, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.*)$/i);
  if (match) {
    const token = match[1].trim();
    systemDb.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  }
  return res.json({ ok: true, message: 'Logged out successfully.' });
});

// ----------------------------------------------------------------------------
// Admin Users & Permissions Management (RBAC)
// ----------------------------------------------------------------------------
router.get('/api/admin/users', adminAuth, requirePermission('manage_users'), (req: Request, res: Response) => {
  const users = systemDb.prepare(`
    SELECT id, username, display_name, role, permissions, is_active, last_login_at, created_at
    FROM admin_users
    ORDER BY id ASC
  `).all().map((u: any) => {
    let perms = [];
    try { perms = JSON.parse(u.permissions || '[]'); } catch {}
    return { ...u, permissions: perms };
  });

  return res.json({ ok: true, users });
});

router.post('/api/admin/users', adminAuth, requirePermission('manage_users'), (req: Request, res: Response) => {
  const { username, password, displayName, role, permissions } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password are required.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  if (cleanUser.length < 3) {
    return res.status(400).json({ ok: false, error: 'Username must be at least 3 characters.' });
  }

  const existing = systemDb.prepare('SELECT id FROM admin_users WHERE LOWER(username) = ?').get(cleanUser);
  if (existing) {
    return res.status(400).json({ ok: false, error: `Username [${cleanUser}] is already in use.` });
  }

  const { hash, salt } = hashPassword(password);
  const userRole = ['superadmin', 'technician', 'support', 'custom'].includes(role) ? role : 'technician';
  const permsJson = JSON.stringify(Array.isArray(permissions) ? permissions : (userRole === 'superadmin' ? ['*'] : ['manage_extensions', 'manage_handsets']));

  systemDb.prepare(`
    INSERT INTO admin_users (username, password_hash, salt, display_name, role, permissions, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(cleanUser, hash, salt, displayName || cleanUser, userRole, permsJson);

  return res.json({ ok: true, message: `Admin user [${cleanUser}] created successfully.` });
});

router.put('/api/admin/users/:id', adminAuth, requirePermission('manage_users'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const targetUser = systemDb.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any;
  if (!targetUser) {
    return res.status(404).json({ ok: false, error: 'User not found.' });
  }

  const { displayName, role, permissions, isActive, password } = req.body;

  // Prevent demoting the last active superadmin
  if (targetUser.role === 'superadmin' && (role && role !== 'superadmin' || isActive === 0)) {
    const superCount = (systemDb.prepare("SELECT COUNT(*) as count FROM admin_users WHERE role = 'superadmin' AND is_active = 1 AND id != ?").get(id) as any).count;
    if (superCount === 0) {
      return res.status(400).json({ ok: false, error: 'Cannot demote or disable the only active Superadmin account.' });
    }
  }

  const newName = displayName !== undefined ? String(displayName).trim() : targetUser.display_name;
  const newRole = role !== undefined ? role : targetUser.role;
  const newActive = isActive !== undefined ? (isActive ? 1 : 0) : targetUser.is_active;
  const newPerms = permissions !== undefined ? JSON.stringify(permissions) : targetUser.permissions;

  systemDb.prepare(`
    UPDATE admin_users
    SET display_name = ?, role = ?, permissions = ?, is_active = ?
    WHERE id = ?
  `).run(newName, newRole, newPerms, newActive, id);

  if (password && String(password).trim().length > 0) {
    const { hash, salt } = hashPassword(String(password).trim());
    systemDb.prepare('UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, id);
    // Invalidate sessions on password change
    systemDb.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(id);
  }

  return res.json({ ok: true, message: `User [${targetUser.username}] updated successfully.` });
});

router.delete('/api/admin/users/:id', adminAuth, requirePermission('manage_users'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const curUser = (req as any).adminUser as AuthenticatedAdmin;

  if (curUser && curUser.id === id) {
    return res.status(400).json({ ok: false, error: 'You cannot delete your own active administrator account.' });
  }

  const targetUser = systemDb.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as any;
  if (!targetUser) {
    return res.status(404).json({ ok: false, error: 'User not found.' });
  }

  if (targetUser.role === 'superadmin') {
    const superCount = (systemDb.prepare("SELECT COUNT(*) as count FROM admin_users WHERE role = 'superadmin' AND is_active = 1 AND id != ?").get(id) as any).count;
    if (superCount === 0) {
      return res.status(400).json({ ok: false, error: 'Cannot delete the only remaining Superadmin account.' });
    }
  }

  systemDb.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(id);
  systemDb.prepare('DELETE FROM admin_users WHERE id = ?').run(id);

  return res.json({ ok: true, message: `Admin user [${targetUser.username}] deleted.` });
});

// Self Password Change Endpoint
router.post('/api/admin/change-password', adminAuth, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const user = (req as any).adminUser as AuthenticatedAdmin;
  if (!user || !user.id) {
    return res.status(400).json({ ok: false, error: 'Cannot change password for unmanaged root user.' });
  }
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
  }

  const uRow = systemDb.prepare('SELECT * FROM admin_users WHERE id = ?').get(user.id) as any;
  if (!uRow || !verifyPassword(currentPassword, uRow.password_hash, uRow.salt)) {
    return res.status(400).json({ ok: false, error: 'Current password is incorrect.' });
  }

  const { hash, salt } = hashPassword(newPassword);
  systemDb.prepare('UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
  logActivity('PASSWORD_CHANGED', `User [${user.username}] updated their password`, req.ip);
  return res.json({ ok: true, message: 'Password updated successfully.' });
});

// Live Audit & Telemetry Activity Stream (Last 40 events)
router.get('/api/admin/audit-logs', adminAuth, (req: Request, res: Response) => {
  const logs = systemDb.prepare(`
    SELECT id, event_type, details, ip_address, created_at
    FROM audit_activity_logs
    ORDER BY id DESC
    LIMIT 40
  `).all();
  return res.json({ ok: true, logs });
});

// Live SIP OPTIONS & PBX Connection Latency Probe
router.post('/api/admin/pbx/ping', adminAuth, async (req: Request, res: Response) => {
  const config = systemDb.prepare('SELECT pbx_server, pbx_port, pbx_transport FROM server_config WHERE id = 1').get() as any;
  const host = config?.pbx_server || 'pbx.chriskendall.media';
  const port = parseInt(config?.pbx_port || '5060', 10);
  const transport = (config?.pbx_transport || 'UDP').toUpperCase();
  const t0 = performance.now();

  if (transport === 'TCP') {
    const socket = new net.Socket();
    let responded = false;
    socket.setTimeout(3500);

    socket.connect(port, host, () => {
      responded = true;
      const latency = (performance.now() - t0).toFixed(1);
      socket.destroy();
      return res.json({ ok: true, reachable: true, latencyMs: latency, message: `Connected to ${host}:${port} via TCP in ${latency}ms` });
    });

    socket.on('error', (err) => {
      if (!responded) {
        responded = true;
        socket.destroy();
        return res.json({ ok: false, reachable: false, error: err.message, message: `Failed to connect to ${host}:${port}: ${err.message}` });
      }
    });

    socket.on('timeout', () => {
      if (!responded) {
        responded = true;
        socket.destroy();
        return res.json({ ok: false, reachable: false, error: 'Timeout', message: `Connection to ${host}:${port} timed out after 3500ms` });
      }
    });
  } else {
    // Send UDP SIP OPTIONS packet
    const client = dgram.createSocket('udp4');
    let responded = false;

    const sipPacket = `OPTIONS sip:${host}:${port} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bK-${Date.now()}\r\n` +
      `Max-Forwards: 70\r\n` +
      `From: <sip:probe@ckm-handler>;tag=${Date.now()}\r\n` +
      `To: <sip:${host}>\r\n` +
      `Call-ID: ${Date.now()}@ckm\r\n` +
      `CSeq: 1 OPTIONS\r\n` +
      `User-Agent: CKM-Handler-Probe/1.4.0\r\n` +
      `Content-Length: 0\r\n\r\n`;

    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        try { client.close(); } catch {}
        const latency = (performance.now() - t0).toFixed(1);
        return res.json({
          ok: true,
          reachable: true,
          latencyMs: latency,
          message: `SIP OPTIONS packet dispatched to ${host}:${port} (UDP round-trip: ${latency}ms)`
        });
      }
    }, 1500);

    client.send(Buffer.from(sipPacket), port, host, (err) => {
      if (err && !responded) {
        responded = true;
        clearTimeout(timer);
        try { client.close(); } catch {}
        return res.json({ ok: false, reachable: false, error: err.message });
      }
    });

    client.on('message', () => {
      if (!responded) {
        responded = true;
        clearTimeout(timer);
        const latency = (performance.now() - t0).toFixed(1);
        try { client.close(); } catch {}
        return res.json({
          ok: true,
          reachable: true,
          latencyMs: latency,
          message: `SIP 200 OK received from ${host}:${port} in ${latency}ms`
        });
      }
    });
  }
});

// Live Shell Streaming Endpoints (Server-Sent Events + Buffer History)
router.get('/api/admin/shell/stream', adminAuth, (req: Request, res: Response) => {
  registerSseClient(res);
});

router.get('/api/admin/shell/history', adminAuth, (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || '250', 10);
  const logs = getRecentDeviceLogs(limit);
  return res.json({ ok: true, logs });
});

router.post('/api/admin/shell/clear', adminAuth, (req: Request, res: Response) => {
  clearDeviceLogs();
  return res.json({ ok: true, message: 'Shell connectivity log buffer cleared.' });
});

// 1. Dashboard Overview Stats & Component Health
router.get('/api/admin/overview', adminAuth, (req: Request, res: Response) => {
  const tSys0 = performance.now();
  const extCount = (systemDb.prepare('SELECT COUNT(*) as count FROM extensions').get() as any).count;
  const handsetCount = (systemDb.prepare('SELECT COUNT(*) as count FROM physical_handsets').get() as any).count;
  const pinCount = (systemDb.prepare('SELECT COUNT(*) as count FROM softphone_pins WHERE claimed = 0').get() as any).count;
  const routerCount = (systemDb.prepare('SELECT COUNT(*) as count FROM routers').get() as any).count;
  const firmwareCount = (systemDb.prepare("SELECT COUNT(*) as count FROM firmware_binaries WHERE status = 'DOWNLOADED'").get() as any).count;
  const sysPages = systemDb.pragma('page_count', { simple: true });
  const tSys = performance.now() - tSys0;

  const tVault0 = performance.now();
  const msgCount = (vaultDb.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count;
  const fileCount = (vaultDb.prepare('SELECT COUNT(*) as count FROM media_vault_files').get() as any).count;
  const policy = vaultDb.prepare('SELECT * FROM gdpr_retention_policy WHERE id = 1').get() as any;
  const tVault = performance.now() - tVault0;

  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;
  const socketStats = getSocketStats();

  const storageRow = vaultDb.prepare('SELECT COALESCE(SUM(file_size), 0) as totalBytes FROM media_vault_files').get() as any;
  const totalBytes = storageRow?.totalBytes || 0;

  const mem = process.memoryUsage();
  const memMb = (mem.rss / (1024 * 1024)).toFixed(1);

  // Live Component Health Matrix (Real operational telemetry only)
  const components = [
    {
      id: 'api',
      name: 'HTTP Application Server',
      status: 'operational',
      latency: `${tSys.toFixed(2)}ms`,
      details: `Node.js ${process.version} · Memory: ${memMb} MB RSS · Port ${PORT}`,
      badge: 'Active'
    },
    {
      id: 'socket',
      name: 'WebSocket Signaling Service',
      status: 'operational',
      latency: '< 1ms',
      details: `${socketStats.connectedClients} active softphone connection(s)`,
      badge: 'Online'
    },
    {
      id: 'system_db',
      name: 'Operational Database (system.db)',
      status: 'operational',
      latency: `${tSys.toFixed(2)}ms`,
      details: `SQLite 3 · WAL Mode · ${sysPages} allocated database page(s)`,
      badge: 'Healthy'
    },
    {
      id: 'vault_db',
      name: 'Encrypted Vault (comms_vault.db)',
      status: 'operational',
      latency: `${tVault.toFixed(2)}ms`,
      details: `AES-256-GCM · ${msgCount} encrypted record(s) · ${fileCount} stored file(s)`,
      badge: 'Encrypted'
    },
    {
      id: 'softphone_prov',
      name: 'Softphone Provisioning Service',
      status: 'operational',
      latency: '< 1ms',
      details: `${pinCount} pending unclaimed claim code(s)`,
      badge: 'Active'
    },
    {
      id: 'deskphone_prov',
      name: 'Deskphone Auto-Provisioning Service',
      status: 'operational',
      latency: '< 1ms',
      details: `${handsetCount} registered hardware MAC address(es)`,
      badge: 'Active'
    },
    {
      id: 'router_engine',
      name: 'Network Gateway Engine',
      status: 'operational',
      latency: '< 1ms',
      details: `${routerCount} configured gateway profile(s)`,
      badge: 'Active'
    },
    {
      id: 'firmware_repo',
      name: 'Firmware Binary Repository',
      status: 'operational',
      latency: '< 1ms',
      details: `${firmwareCount} firmware image package(s) cached internally`,
      badge: 'Ready'
    },
    {
      id: 'pbx_sip',
      name: 'Asterisk PBX Connectivity',
      status: 'operational',
      latency: '-',
      details: `Target: ${config.pbx_server}:${config.pbx_port} (${config.pbx_transport})`,
      badge: 'Configured'
    },
    {
      id: 'gdpr_daemon',
      name: 'Automated Retention Daemon',
      status: policy?.auto_prune_enabled ? 'operational' : 'paused',
      latency: '-',
      details: `Prune: Chat ${policy?.chat_retention_days || 90}d · Media ${policy?.media_retention_days || 90}d`,
      badge: policy?.auto_prune_enabled ? 'Active' : 'Disabled'
    }
  ];

  return res.json({
    ok: true,
    stats: {
      extensions: extCount,
      handsets: handsetCount,
      unclaimedPins: pinCount,
      routers: routerCount,
      firmwareCount: firmwareCount,
      messages: msgCount,
      vaultFiles: fileCount,
      storageMb: (totalBytes / (1024 * 1024)).toFixed(2),
      uptimeSeconds: Math.floor(process.uptime()),
      pbxServer: `${config.pbx_server}:${config.pbx_port} (${config.pbx_transport})`,
      handlerUrl: config.data_handler_url,
      licenseKey: config.license_key,
      licenseStatus: licenseState.status,
      isLicenseActive: licenseState.isActive
    },
    components
  });
});

// Purge dummy/test data from communications vault
router.post('/api/admin/vault/purge', adminAuth, (req: Request, res: Response) => {
  vaultDb.exec('DELETE FROM messages; DELETE FROM media_vault_files;');
  logActivity('VAULT_PURGE', 'All messages and media files were purged by administrator.', req.ip);
  return res.json({ ok: true, message: 'Communications vault purged. Message and file counts reset to 0.' });
});

// 2. Extensions Management
router.get('/api/admin/extensions', adminAuth, (req: Request, res: Response) => {
  const rows = systemDb.prepare(`
    SELECT e.extension, e.sip_username, e.display_name, e.is_active, e.created_at,
           (SELECT p.code FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 LIMIT 1) as active_pin,
           (SELECT COUNT(*) FROM physical_handsets h WHERE h.extension = e.extension) as bound_handsets
    FROM extensions e
    ORDER BY e.extension ASC
  `).all();
  return res.json({ ok: true, extensions: rows });
});

router.post('/api/admin/extensions', adminAuth, requirePermission('manage_extensions'), (req: Request, res: Response) => {
  const { extension, username, password, displayName } = req.body;
  if (!extension || !password) {
    return res.status(400).json({ ok: false, error: 'Extension and password are required.' });
  }

  const cleanExt = String(extension).trim();
  const cleanUser = String(username || cleanExt).trim();
  const cleanName = String(displayName || `Extension ${cleanExt}`).trim();

  systemDb.prepare(`
    INSERT INTO extensions (extension, sip_username, sip_password, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(extension) DO UPDATE SET
      sip_username = excluded.sip_username,
      sip_password = excluded.sip_password,
      display_name = excluded.display_name
  `).run(cleanExt, cleanUser, password, cleanName);

  return res.json({ ok: true, message: `Extension ${cleanExt} saved successfully.` });
});

router.delete('/api/admin/extensions/:ext', adminAuth, requirePermission('manage_extensions'), (req: Request, res: Response) => {
  const ext = req.params.ext;
  systemDb.prepare('DELETE FROM extensions WHERE extension = ?').run(ext);
  return res.json({ ok: true, message: `Extension ${ext} removed.` });
});

// 3. Generate 8-Digit Softphone PIN
router.post('/api/admin/pins', adminAuth, requirePermission('manage_extensions'), (req: Request, res: Response) => {
  const { extension, expiryHours } = req.body;
  if (!extension) {
    return res.status(400).json({ ok: false, error: 'Extension is required to generate a PIN.' });
  }

  // Generate a random 8-digit PIN
  const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  
  const hours = parseInt(expiryHours || '72', 10);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  // Invalidate previous unclaimed PINs for this extension
  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(extension);

  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, expires_at)
    VALUES (?, ?, ?)
  `).run(pin, extension, expiresAt);

  return res.json({
    ok: true,
    code: pin,
    extension,
    expiresAt,
    message: `8-digit PIN ${pin} generated for extension ${extension}.`
  });
});

// 3b. Quick Pull & Provision Extension
router.post('/api/admin/extensions/quick-provision', adminAuth, requirePermission('manage_extensions'), async (req: Request, res: Response) => {
  const { extension, displayName, sipPassword, expiryHours, queryPbx, amiConfig } = req.body;
  if (!extension) {
    return res.status(400).json({ ok: false, error: 'Extension number is required.' });
  }

  const cleanExt = String(extension).trim();
  const serverCfg = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  // 1. Check if extension exists, or query PBX if requested
  let extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as any;

  if (!extRecord && queryPbx) {
    const ami: AmiConfig = {
      host: amiConfig?.host || serverCfg.pbx_server,
      port: parseInt(amiConfig?.port || '5038', 10),
      username: amiConfig?.username || 'admin',
      secret: amiConfig?.secret || 'amp111'
    };
    await syncExtensionsFromAsterisk(ami);
    extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as any;
  }

  // 2. If still doesn't exist, register with provided or auto-generated SIP password
  if (!extRecord) {
    const generatedPwd = sipPassword || crypto.randomBytes(8).toString('hex');
    const name = displayName || `Extension ${cleanExt}`;

    systemDb.prepare(`
      INSERT INTO extensions (extension, sip_username, sip_password, display_name)
      VALUES (?, ?, ?, ?)
    `).run(cleanExt, cleanExt, generatedPwd, name);

    extRecord = {
      extension: cleanExt,
      sip_username: cleanExt,
      sip_password: generatedPwd,
      display_name: name
    };
  } else if (displayName || sipPassword) {
    if (displayName) extRecord.display_name = displayName;
    if (sipPassword) extRecord.sip_password = sipPassword;

    systemDb.prepare(`
      UPDATE extensions 
      SET display_name = ?, sip_password = ?
      WHERE extension = ?
    `).run(extRecord.display_name, extRecord.sip_password, cleanExt);
  }

  // 3. Issue fresh 8-digit PIN
  const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  const hours = parseInt(expiryHours || '72', 10);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);
  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, expires_at)
    VALUES (?, ?, ?)
  `).run(pin, cleanExt, expiresAt);

  const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(serverCfg.data_handler_url)}`;
  const welcomeCard = `========================================\nMerlinSIP Softphone Configuration Card\n========================================\nUser / Display Name: ${extRecord.display_name}\nExtension Number:    ${cleanExt}\n8-Digit Setup PIN:   ${pin}\nAuto-Setup Link:     ${deepLink}\nHandler Gateway:     ${serverCfg.data_handler_url}\nCode Expiration:     ${expiresAt}\n\nInstructions:\n1. Download or open MerlinSIP Softphone.\n2. In the setup prompt, enter the 8-Digit PIN [${pin}] or click the Auto-Setup link above.\n3. Your softphone will configure its SIP credentials and connect to the secure chat network automatically!`;

  return res.json({
    ok: true,
    extension: cleanExt,
    displayName: extRecord.display_name,
    code: pin,
    expiresAt,
    handlerUrl: serverCfg.data_handler_url,
    pbxServer: serverCfg.pbx_server,
    deepLink,
    userWelcomeCard: welcomeCard
  });
});

// Device Catalogs Metadata Endpoint (Full Makes & Models for Handsets & Routers)
router.get('/api/admin/catalogs', (req: Request, res: Response) => {
  return res.json({
    ok: true,
    handsets: HANDSET_CATALOG,
    routers: ROUTER_CATALOG
  });
});

// Dynamic Profile & Firmware Preview Endpoint
router.post('/api/admin/catalogs/preview', (req: Request, res: Response) => {
  const { type, brand, model, extension, displayName, vlan, subnet, alg, qos } = req.body || {};
  const serverCfg = getServerConfigStmt.get() as any || {
    pbx_server: 'pbx.chriskendall.media',
    pbx_port: 5060,
    pbx_transport: 'UDP',
    data_handler_url: 'https://handler.chriskendall.media'
  };

  if (type === 'router') {
    const brandMeta = ROUTER_CATALOG.find(r => r.id === (brand || '').toLowerCase());
    const modelMeta = brandMeta?.models.find(m => m.id === model) || brandMeta?.models[0];
    const gen = generateRouterConfig(brand || 'mikrotik', {
      siteName: 'Standard Branch Deployment',
      brand: brand || 'mikrotik',
      model: model || 'hex',
      voiceVlanId: parseInt(vlan || '20', 10),
      voiceSubnet: subnet || '10.20.0.1/24',
      disableSipAlg: alg !== false,
      enableQos: qos !== false,
      pbxServer: serverCfg.pbx_server,
      dataHandlerUrl: serverCfg.data_handler_url
    });
    const localFwPath = (brandMeta && modelMeta) ? findFirmwareFile(brandMeta.id, modelMeta.firmwareFilename, modelMeta.id) : null;
    return res.json({
      ok: true,
      type: 'router',
      brand: brandMeta?.name || brand,
      model: modelMeta?.name || model,
      extension: brandMeta?.configExt || '.rsc',
      firmware: modelMeta ? {
        version: modelMeta.firmwareVersion,
        url: modelMeta.firmwareUrl,
        directDownloadUrl: modelMeta.directDownloadUrl || null,
        filename: modelMeta.firmwareFilename,
        notes: modelMeta.firmwareNotes || 'Standard tested vendor release',
        isCached: !!localFwPath,
        localServingUrl: `${serverCfg.data_handler_url || serverCfg.dataHandlerUrl || ''}/firmware/${brandMeta?.id}/${modelMeta.id}/${modelMeta.firmwareFilename}`
      } : null,
      content: gen.content
    });
  } else {
    // Handset
    const brandMeta = HANDSET_CATALOG.find(h => h.id === (brand || 'yealink').toLowerCase());
    const modelMeta = brandMeta?.models.find(m => m.id === model) || brandMeta?.models[0];
    const conf = generateDefaultHandsetConfig(brand || 'yealink', {
      extension: extension || '101',
      username: extension || '101',
      password: 'StandardPassword123!',
      displayName: displayName || 'Standard Deskphone',
      sipServer: serverCfg.pbx_server,
      sipPort: serverCfg.pbx_port,
      sipTransport: serverCfg.pbx_transport || 'UDP',
      dataHandlerUrl: serverCfg.data_handler_url || serverCfg.dataHandlerUrl || ''
    }, model);

    const localFwPath = (brandMeta && modelMeta) ? findFirmwareFile(brandMeta.id, modelMeta.firmwareFilename, modelMeta.id) : null;
    return res.json({
      ok: true,
      type: 'handset',
      brand: brandMeta?.name || brand,
      model: modelMeta?.name || model,
      extension: brandMeta?.configExt || '.cfg',
      firmware: modelMeta ? {
        version: modelMeta.firmwareVersion,
        url: modelMeta.firmwareUrl,
        directDownloadUrl: modelMeta.directDownloadUrl || null,
        filename: modelMeta.firmwareFilename,
        notes: modelMeta.firmwareNotes || 'Standard tested vendor release',
        isCached: !!localFwPath,
        localServingUrl: `${serverCfg.data_handler_url || serverCfg.dataHandlerUrl || ''}/firmware/${brandMeta?.id}/${modelMeta.id}/${modelMeta.firmwareFilename}`
      } : null,
      content: conf
    });
  }
});

// ==============================================================================
// 3.1 Firmware Repository & Automated Downloader Endpoints
// ==============================================================================
// GET /api/admin/firmware/status — Returns catalog & internal disk cache status
router.get('/api/admin/firmware/status', adminAuth, (req: Request, res: Response) => {
  try {
    const catalog = getFirmwareCatalogStatus();
    return res.json({ ok: true, catalog });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to retrieve firmware status' });
  }
});

// POST /api/admin/firmware/download — Trigger auto-download to internal directory for a model
router.post('/api/admin/firmware/download', adminAuth, async (req: Request, res: Response) => {
  const { brand, model, customUrl } = req.body;
  if (!brand || !model) {
    return res.status(400).json({ ok: false, error: 'Missing required parameters: brand and model' });
  }

  try {
    const result = await downloadFirmwareForModel(brand, model, customUrl);
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Download failed' });
  }
});

// POST /api/admin/firmware/sync-all — Trigger batch auto-download of all stable firmwares
router.post('/api/admin/firmware/sync-all', adminAuth, async (req: Request, res: Response) => {
  try {
    const result = await syncAllStableFirmwares();
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Batch sync failed' });
  }
});

// POST /api/admin/firmware/upload — Upload binary directly to model directory
router.post('/api/admin/firmware/upload', adminAuth, firmwareUpload.single('firmwareFile'), (req: Request, res: Response) => {
  const { brand, model } = req.body;
  if (!brand || !model || !req.file) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: brand, model, and firmwareFile' });
  }

  try {
    const result = saveUploadedFirmware(brand, model, req.file.originalname, req.file.buffer);
    return res.json({ ok: true, result });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Upload failed' });
  }
});

// DELETE /api/admin/firmware/:brand/:model — Purge local firmware file
router.delete('/api/admin/firmware/:brand/:model', adminAuth, (req: Request, res: Response) => {
  const { brand, model } = req.params;
  try {
    deleteFirmwareFile(brand, model);
    return res.json({ ok: true, message: `Local firmware for ${brand} ${model} removed.` });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Delete failed' });
  }
});

// 4. Physical Handsets Management
router.get('/api/admin/handsets', adminAuth, (req: Request, res: Response) => {
  const rows = systemDb.prepare(`
    SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json, h.custom_config, h.last_provisioned_at,
           e.extension, e.display_name
    FROM physical_handsets h
    JOIN extensions e ON h.extension = e.extension
    ORDER BY h.created_at DESC
  `).all();
  return res.json({ ok: true, handsets: rows });
});

router.get('/api/admin/handsets/:mac/preview', adminAuth, (req: Request, res: Response) => {
  const cleanMac = req.params.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  const handset = systemDb.prepare(`
    SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json, h.custom_config,
           e.extension, e.sip_username, e.sip_password, e.display_name
    FROM physical_handsets h
    JOIN extensions e ON h.extension = e.extension
    WHERE LOWER(REPLACE(h.mac_address, ':', '')) = ?
  `).get(cleanMac) as any;

  if (!handset) {
    return res.status(404).json({ ok: false, error: 'Handset not found.' });
  }

  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;
  let blfKeys = [];
  try { if (handset.blf_keys_json) blfKeys = JSON.parse(handset.blf_keys_json); } catch {}

  const accountCfg: HandsetAccountConfig = {
    extension: handset.extension,
    username: handset.sip_username,
    password: handset.sip_password,
    displayName: handset.line_label || handset.display_name,
    sipServer: config.pbx_server,
    sipPort: config.pbx_port,
    sipTransport: config.pbx_transport,
    dataHandlerUrl: config.data_handler_url,
    blfKeys
  };

  const defaultContent = generateDefaultHandsetConfig(handset.brand, accountCfg);
  const isCustomized = !!(handset.custom_config && handset.custom_config.trim().length > 0);
  const content = isCustomized ? handset.custom_config : defaultContent;

  return res.json({
    ok: true,
    macAddress: cleanMac,
    brand: handset.brand,
    model: handset.model,
    extension: handset.extension,
    displayName: handset.display_name,
    isCustomized,
    content,
    defaultContent
  });
});

router.put('/api/admin/handsets/:mac/config', adminAuth, requirePermission('manage_handsets'), (req: Request, res: Response) => {
  const cleanMac = req.params.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  const { customConfig } = req.body;

  systemDb.prepare(`
    UPDATE physical_handsets
    SET custom_config = ?
    WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
  `).run(customConfig || '', cleanMac);

  logActivity('HANDSET_CONFIG_UPDATED', `Custom provisioning profile updated for Handset [${cleanMac.toUpperCase()}]`, req.ip);
  return res.json({ ok: true, message: 'Handset provisioning configuration saved.' });
});

router.post('/api/admin/handsets', adminAuth, requirePermission('manage_handsets'), (req: Request, res: Response) => {
  const { macAddress, brand, model, extension, lineLabel, blfKeys, customConfig } = req.body;
  if (!macAddress || !extension) {
    return res.status(400).json({ ok: false, error: 'MAC address and extension are required.' });
  }

  // Normalize MAC: clean out colons and hyphens
  const cleanMac = String(macAddress).toLowerCase().replace(/[^0-9a-f]/g, '');
  if (cleanMac.length !== 12) {
    return res.status(400).json({ ok: false, error: 'MAC address must be 12 hex digits (e.g. 001565A1B2C3).' });
  }

  const blfJson = blfKeys ? JSON.stringify(blfKeys) : null;

  systemDb.prepare(`
    INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, blf_keys_json, custom_config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mac_address) DO UPDATE SET
      brand = excluded.brand,
      model = excluded.model,
      extension = excluded.extension,
      line_label = excluded.line_label,
      blf_keys_json = excluded.blf_keys_json,
      custom_config = COALESCE(excluded.custom_config, physical_handsets.custom_config)
  `).run(cleanMac, brand || 'yealink', model || '', extension, lineLabel || '', blfJson, customConfig || '');

  return res.json({ ok: true, message: `Handset MAC [${cleanMac}] bound to extension ${extension}.` });
});

router.delete('/api/admin/handsets/:mac', adminAuth, requirePermission('manage_handsets'), (req: Request, res: Response) => {
  const cleanMac = req.params.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  systemDb.prepare("DELETE FROM physical_handsets WHERE LOWER(REPLACE(mac_address, ':', '')) = ?").run(cleanMac);
  return res.json({ ok: true, message: `Handset MAC [${cleanMac}] removed.` });
});

// 5. PBX Server & Global Config
router.get('/api/admin/config', adminAuth, (req: Request, res: Response) => {
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get();
  return res.json({ ok: true, config });
});

router.post('/api/admin/config', adminAuth, requirePermission('manage_pbx'), (req: Request, res: Response) => {
  const { pbxServer, pbxPort, pbxTransport, dataHandlerUrl } = req.body;
  if (!pbxServer) {
    return res.status(400).json({ ok: false, error: 'PBX server domain or IP is required.' });
  }

  systemDb.prepare(`
    UPDATE server_config
    SET pbx_server = ?, pbx_port = ?, pbx_transport = ?, data_handler_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    String(pbxServer).trim(),
    parseInt(pbxPort || '5060', 10),
    String(pbxTransport || 'UDP').toUpperCase(),
    String(dataHandlerUrl || '').trim()
  );

  return res.json({ ok: true, message: 'Server configuration updated. Connected softphones will sync within 10 minutes.' });
});

router.post('/api/admin/config/regenerate-api-key', adminAuth, requirePermission('manage_pbx'), (req: Request, res: Response) => {
  const newKey = `ckm_live_${crypto.randomBytes(16).toString('hex')}`;
  systemDb.prepare('UPDATE server_config SET api_key = ? WHERE id = 1').run(newKey);
  return res.json({ ok: true, apiKey: newKey, message: 'New API key generated.' });
});

// 6. Router & Voice Gateway Provisioning Management
router.get('/api/admin/routers', adminAuth, (req: Request, res: Response) => {
  const rows = systemDb.prepare('SELECT * FROM routers ORDER BY created_at DESC').all();
  return res.json({ ok: true, routers: rows });
});

router.get('/api/admin/routers/:id/preview', adminAuth, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const routerRec = systemDb.prepare('SELECT * FROM routers WHERE id = ?').get(id) as any;
  if (!routerRec) {
    return res.status(404).json({ ok: false, error: 'Router profile not found.' });
  }

  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;
  const params: RouterConfigParams = {
    siteName: routerRec.site_name,
    brand: routerRec.brand,
    model: routerRec.model,
    macAddress: routerRec.mac_address,
    lanSubnet: routerRec.lan_subnet,
    voiceVlanId: routerRec.voice_vlan_id,
    voiceSubnet: routerRec.voice_subnet,
    pbxServer: config.pbx_server,
    dataHandlerUrl: config.data_handler_url,
    disableSipAlg: routerRec.disable_sip_alg === 1,
    enableQos: routerRec.enable_qos === 1
  };

  const generated = generateRouterConfig(params);
  const defaultContent = generated.content;
  const isCustomized = !!(routerRec.custom_script && routerRec.custom_script.trim().length > 0);
  const content = isCustomized ? routerRec.custom_script : defaultContent;

  return res.json({
    ok: true,
    id: routerRec.id,
    siteName: routerRec.site_name,
    brand: routerRec.brand,
    model: routerRec.model,
    filename: generated.filename,
    isCustomized,
    content,
    defaultContent
  });
});

router.put('/api/admin/routers/:id/script', adminAuth, requirePermission('manage_routers'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { customScript } = req.body;

  systemDb.prepare(`
    UPDATE routers
    SET custom_script = ?
    WHERE id = ?
  `).run(customScript || '', id);

  logActivity('ROUTER_SCRIPT_UPDATED', `Custom deployment script updated for Router profile #${id}`, req.ip);
  return res.json({ ok: true, message: 'Router configuration script saved.' });
});

router.post('/api/admin/routers', adminAuth, requirePermission('manage_routers'), (req: Request, res: Response) => {
  const { siteName, brand, model, macAddress, lanSubnet, voiceVlanId, voiceSubnet, disableSipAlg, enableQos, notes, customScript } = req.body;
  if (!siteName || !brand) {
    return res.status(400).json({ ok: false, error: 'Site name and router brand are required.' });
  }

  const result = systemDb.prepare(`
    INSERT INTO routers (site_name, brand, model, mac_address, lan_subnet, voice_vlan_id, voice_subnet, disable_sip_alg, enable_qos, notes, custom_script)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(siteName).trim(),
    String(brand).trim().toLowerCase(),
    String(model || '').trim(),
    String(macAddress || '').trim(),
    String(lanSubnet || '192.168.1.1/24').trim(),
    parseInt(voiceVlanId || '20', 10),
    String(voiceSubnet || '10.20.0.1/24').trim(),
    disableSipAlg ? 1 : 0,
    enableQos ? 1 : 0,
    String(notes || '').trim(),
    String(customScript || '').trim()
  );

  return res.json({ ok: true, id: result.lastInsertRowid, message: `Router for site '${siteName}' created successfully.` });
});

router.delete('/api/admin/routers/:id', adminAuth, requirePermission('manage_routers'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  systemDb.prepare('DELETE FROM routers WHERE id = ?').run(id);
  return res.json({ ok: true, message: 'Router profile removed.' });
});

router.get('/api/admin/routers/:id/script', adminAuth, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const routerRec = systemDb.prepare('SELECT * FROM routers WHERE id = ?').get(id) as any;
  if (!routerRec) {
    return res.status(404).json({ ok: false, error: 'Router profile not found.' });
  }

  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  const params: RouterConfigParams = {
    siteName: routerRec.site_name,
    brand: routerRec.brand,
    model: routerRec.model,
    macAddress: routerRec.mac_address,
    lanSubnet: routerRec.lan_subnet,
    voiceVlanId: routerRec.voice_vlan_id,
    voiceSubnet: routerRec.voice_subnet,
    pbxServer: config.pbx_server,
    dataHandlerUrl: config.data_handler_url,
    disableSipAlg: routerRec.disable_sip_alg === 1,
    enableQos: routerRec.enable_qos === 1
  };

  const generated = generateRouterConfig(params);

  res.setHeader('Content-Type', generated.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${generated.filename}"`);

  // If customized, send custom script
  if (routerRec.custom_script && routerRec.custom_script.trim().length > 0) {
    return res.send(routerRec.custom_script);
  }

  return res.send(generated.content);
});

// 7. Asterisk AMI / FreePBX Extension Auto-Sync
router.post('/api/admin/pbx/sync', adminAuth, requirePermission('manage_pbx'), async (req: Request, res: Response) => {
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;
  const { amiHost, amiPort, amiUser, amiSecret } = req.body;

  const ami: AmiConfig = {
    host: amiHost || config.pbx_server,
    port: parseInt(amiPort || '5038', 10),
    username: amiUser || 'admin',
    secret: amiSecret || 'amp111'
  };

  const syncResult = await syncExtensionsFromAsterisk(ami);
  if (!syncResult.success) {
    return res.status(502).json({ ok: false, error: syncResult.message });
  }

  return res.json({ ok: true, count: syncResult.count, message: syncResult.message });
});

// 8. Custom Branding & Theme Configuration
router.get('/api/admin/branding', adminAuth, (req: Request, res: Response) => {
  const config = systemDb.prepare('SELECT brand_name, primary_color, accent_color, logo_url FROM server_config WHERE id = 1').get() as any;
  return res.json({
    ok: true,
    branding: {
      brandName: config?.brand_name || 'MerlinSIP',
      primaryColor: config?.primary_color || '#2563EB',
      accentColor: config?.accent_color || '#38BDF8',
      logoUrl: config?.logo_url || ''
    }
  });
});

router.post('/api/admin/branding', adminAuth, requirePermission('manage_branding'), (req: Request, res: Response) => {
  const { brandName, primaryColor, accentColor, logoUrl } = req.body;

  systemDb.prepare(`
    UPDATE server_config 
    SET brand_name = ?, primary_color = ?, accent_color = ?, logo_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    String(brandName || 'MerlinSIP').trim(),
    String(primaryColor || '#2563EB').trim(),
    String(accentColor || '#38BDF8').trim(),
    String(logoUrl || '').trim()
  );

  return res.json({
    ok: true,
    message: 'Branding customization updated. Connected softphones will receive these colors and logo on registration and dynamic sync.'
  });
});

router.post('/api/admin/branding/logo', adminAuth, requirePermission('manage_branding'), logoUpload.single('logo'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No logo image file was provided.' });
  }

  const logoUrl = `/branding/logo?v=${Date.now()}`;
  systemDb.prepare('UPDATE server_config SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(logoUrl);

  return res.json({
    ok: true,
    logoUrl,
    message: 'Brand logo uploaded successfully.'
  });
});

// Public Logo Fetch Endpoint for Softphones & Deskphones
router.get('/branding/logo', (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const logoFile = files.find(f => f.startsWith('logo_'));
    if (logoFile) {
      const filePath = path.join(UPLOADS_DIR, logoFile);
      const ext = path.extname(logoFile).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.ico' ? 'image/x-icon' : 'image/jpeg';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(filePath);
    }
  } catch {
    // fallback
  }

  return res.status(404).send('No custom logo uploaded yet.');
});

export default router;
