import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import systemDb from '../database/systemDb';
import { syncExtensionsFromAsterisk, AmiConfig } from '../services/pbxSyncService';

const router = Router();

// API Key Validation Middleware
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const headerKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!headerKey || typeof headerKey !== 'string') {
    return res.status(401).json({ ok: false, error: 'API key required. Provide via X-API-Key header.' });
  }

  const config = systemDb.prepare('SELECT api_key FROM server_config WHERE id = 1').get() as any;
  if (!config?.api_key) {
    return res.status(500).json({ ok: false, error: 'Server API key has not been configured.' });
  }

  const clientKeyBuf = Buffer.from(headerKey);
  const serverKeyBuf = Buffer.from(config.api_key);

  if (clientKeyBuf.length === serverKeyBuf.length && crypto.timingSafeEqual(clientKeyBuf, serverKeyBuf)) {
    return next();
  }

  return res.status(403).json({ ok: false, error: 'Invalid API key.' });
};

// 1. External Inbound Provisioning API (CRM / Billing / Webhooks / Portal)
// POST /api/v1/integrations/provision-user
router.post('/api/v1/integrations/provision-user', apiKeyAuth, async (req: Request, res: Response) => {
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
    // Update existing if new parameters provided
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

// 2. Fetch or Refresh Provisioning Code for an Extension via API
// GET /api/v1/integrations/extension/:ext/code
router.get('/api/v1/integrations/extension/:ext/code', apiKeyAuth, (req: Request, res: Response) => {
  const cleanExt = String(req.params.ext).trim();
  const extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as any;
  if (!extRecord) {
    return res.status(404).json({ ok: false, error: `Extension ${cleanExt} not found.` });
  }

  const serverCfg = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  // Check for active unclaimed PIN first
  let pinRecord = systemDb.prepare(`
    SELECT * FROM softphone_pins 
    WHERE extension = ? AND claimed = 0 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanExt) as any;

  let pin = pinRecord?.code;
  let expiresAt = pinRecord?.expires_at;

  // Generate fresh one if none exists
  if (!pin) {
    pin = Math.floor(10000000 + Math.random() * 90000000).toString();
    expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);
    systemDb.prepare('INSERT INTO softphone_pins (code, extension, expires_at) VALUES (?, ?, ?)').run(pin, cleanExt, expiresAt);
  }

  const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(serverCfg.data_handler_url)}`;

  return res.json({
    ok: true,
    extension: cleanExt,
    displayName: extRecord.display_name,
    code: pin,
    expiresAt,
    handlerUrl: serverCfg.data_handler_url,
    deepLink
  });
});

export default router;
