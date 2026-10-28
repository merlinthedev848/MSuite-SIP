import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import systemDb from '../database/systemDb';
import vaultDb from '../database/vaultDb';
import { ADMIN_USER, ADMIN_PASS, UPLOADS_DIR } from '../config';
import { generateRouterConfig, RouterConfigParams } from '../templates/routerTemplates';
import { licenseState } from '../services/licenseGuard';
import { syncExtensionsFromAsterisk, AmiConfig } from '../services/pbxSyncService';

const router = Router();

// Simple Admin Authentication Middleware
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CKM Handler Admin"');
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  const match = authHeader.match(/^Basic\s+(.*)$/i);
  if (!match) {
    return res.status(401).json({ ok: false, error: 'Invalid authentication format' });
  }

  const credentials = Buffer.from(match[1], 'base64').toString('utf-8');
  const [user, pass] = credentials.split(':');

  const userBuf = Buffer.from(user || '');
  const adminUserBuf = Buffer.from(ADMIN_USER);
  const passBuf = Buffer.from(pass || '');
  const adminPassBuf = Buffer.from(ADMIN_PASS);

  const userMatch = userBuf.length === adminUserBuf.length && crypto.timingSafeEqual(userBuf, adminUserBuf);
  const passMatch = passBuf.length === adminPassBuf.length && crypto.timingSafeEqual(passBuf, adminPassBuf);

  if (userMatch && passMatch) {
    return next();
  }

  return res.status(403).json({ ok: false, error: 'Invalid admin credentials' });
};

// 1. Dashboard Overview Stats
router.get('/api/admin/overview', adminAuth, (req: Request, res: Response) => {
  const extCount = (systemDb.prepare('SELECT COUNT(*) as count FROM extensions').get() as any).count;
  const handsetCount = (systemDb.prepare('SELECT COUNT(*) as count FROM physical_handsets').get() as any).count;
  const pinCount = (systemDb.prepare('SELECT COUNT(*) as count FROM softphone_pins WHERE claimed = 0').get() as any).count;
  const msgCount = (vaultDb.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count;
  const fileCount = (vaultDb.prepare('SELECT COUNT(*) as count FROM media_vault_files').get() as any).count;
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  // Calculate vault storage size
  let totalBytes = 0;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const f of files) {
      const stat = fs.statSync(`${UPLOADS_DIR}/${f}`);
      totalBytes += stat.size;
    }
  } catch {
    // ignore
  }

  return res.json({
    ok: true,
    stats: {
      extensions: extCount,
      handsets: handsetCount,
      unclaimedPins: pinCount,
      messages: msgCount,
      vaultFiles: fileCount,
      storageMb: (totalBytes / (1024 * 1024)).toFixed(2),
      uptimeSeconds: Math.floor(process.uptime()),
      pbxServer: `${config.pbx_server}:${config.pbx_port} (${config.pbx_transport})`,
      handlerUrl: config.data_handler_url,
      licenseKey: config.license_key,
      licenseStatus: licenseState.status,
      isLicenseActive: licenseState.isActive
    }
  });
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

router.post('/api/admin/extensions', adminAuth, (req: Request, res: Response) => {
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

router.delete('/api/admin/extensions/:ext', adminAuth, (req: Request, res: Response) => {
  const ext = req.params.ext;
  systemDb.prepare('DELETE FROM extensions WHERE extension = ?').run(ext);
  return res.json({ ok: true, message: `Extension ${ext} removed.` });
});

// 3. Generate 8-Digit Softphone PIN
router.post('/api/admin/pins', adminAuth, (req: Request, res: Response) => {
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
router.post('/api/admin/extensions/quick-provision', adminAuth, async (req: Request, res: Response) => {
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

// 4. Physical Handsets Management
router.get('/api/admin/handsets', adminAuth, (req: Request, res: Response) => {
  const rows = systemDb.prepare(`
    SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json, h.last_provisioned_at,
           e.extension, e.display_name
    FROM physical_handsets h
    JOIN extensions e ON h.extension = e.extension
    ORDER BY h.created_at DESC
  `).all();
  return res.json({ ok: true, handsets: rows });
});

router.post('/api/admin/handsets', adminAuth, (req: Request, res: Response) => {
  const { macAddress, brand, model, extension, lineLabel, blfKeys } = req.body;
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
    INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, blf_keys_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(mac_address) DO UPDATE SET
      brand = excluded.brand,
      model = excluded.model,
      extension = excluded.extension,
      line_label = excluded.line_label,
      blf_keys_json = excluded.blf_keys_json
  `).run(cleanMac, brand || 'yealink', model || '', extension, lineLabel || '', blfJson);

  return res.json({ ok: true, message: `Handset MAC [${cleanMac}] bound to extension ${extension}.` });
});

router.delete('/api/admin/handsets/:mac', adminAuth, (req: Request, res: Response) => {
  const cleanMac = req.params.mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  systemDb.prepare('DELETE FROM physical_handsets WHERE LOWER(REPLACE(mac_address, ":", "")) = ?').run(cleanMac);
  return res.json({ ok: true, message: `Handset MAC [${cleanMac}] removed.` });
});

// 5. PBX Server & Global Config
router.get('/api/admin/config', adminAuth, (req: Request, res: Response) => {
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get();
  return res.json({ ok: true, config });
});

router.post('/api/admin/config', adminAuth, (req: Request, res: Response) => {
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

router.post('/api/admin/config/regenerate-api-key', adminAuth, (req: Request, res: Response) => {
  const newKey = `ckm_live_${crypto.randomBytes(16).toString('hex')}`;
  systemDb.prepare('UPDATE server_config SET api_key = ? WHERE id = 1').run(newKey);
  return res.json({ ok: true, apiKey: newKey, message: 'New API key generated.' });
});

// 6. Router & Voice Gateway Provisioning Management
router.get('/api/admin/routers', adminAuth, (req: Request, res: Response) => {
  const rows = systemDb.prepare('SELECT * FROM routers ORDER BY created_at DESC').all();
  return res.json({ ok: true, routers: rows });
});

router.post('/api/admin/routers', adminAuth, (req: Request, res: Response) => {
  const { siteName, brand, model, macAddress, lanSubnet, voiceVlanId, voiceSubnet, disableSipAlg, enableQos, notes } = req.body;
  if (!siteName || !brand) {
    return res.status(400).json({ ok: false, error: 'Site name and router brand are required.' });
  }

  const result = systemDb.prepare(`
    INSERT INTO routers (site_name, brand, model, mac_address, lan_subnet, voice_vlan_id, voice_subnet, disable_sip_alg, enable_qos, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    String(notes || '').trim()
  );

  return res.json({ ok: true, id: result.lastInsertRowid, message: `Router for site '${siteName}' created successfully.` });
});

router.delete('/api/admin/routers/:id', adminAuth, (req: Request, res: Response) => {
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
  return res.send(generated.content);
});

// 7. Asterisk AMI / FreePBX Extension Auto-Sync
router.post('/api/admin/pbx/sync', adminAuth, async (req: Request, res: Response) => {
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

export default router;
