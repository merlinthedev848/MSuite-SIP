import { ServerConfigRow, ExtensionRow, SoftphonePinRow, PbxInstanceRow } from '../types/models';
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import systemDb, { logActivity } from '../database/systemDb';
import vaultDb from '../database/vaultDb';
import { syncExtensionsFromAsterisk, AmiConfig } from '../services/pbxSyncService';
import { broadcastDeviceLog } from '../services/telemetryStream';
import { sendEmail, SmtpConfig } from '../services/emailService';

const router = Router();

const defaultServerConfig: ServerConfigRow = {
  id: 1,
  pbx_server: '127.0.0.1',
  pbx_port: 5060,
  pbx_transport: 'UDP',
  data_handler_url: 'https://handler.chriskendall.media',
  license_key: null,
  api_key: null,
  brand_name: 'MerlinSIP',
  primary_color: '#2563EB',
  accent_color: '#38BDF8',
  logo_url: ''
};

// ==============================================================================
// Secure API Key Validation Middleware
// Supports both X-API-Key and Authorization: Bearer headers with timing-safe check
// ==============================================================================
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const headerKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!headerKey || typeof headerKey !== 'string') {
    return res.status(401).json({
      ok: false,
      error: 'API key required. Provide via X-API-Key header or Authorization: Bearer <token>.'
    });
  }

  const config = systemDb.prepare('SELECT api_key FROM server_config WHERE id = 1').get() as Pick<ServerConfigRow, 'api_key'> | undefined;
  if (!config?.api_key) {
    return res.status(500).json({ ok: false, error: 'Server API key has not been configured in Global Settings.' });
  }

  const clientKeyBuf = Buffer.from(headerKey);
  const serverKeyBuf = Buffer.from(config.api_key);

  if (clientKeyBuf.length === serverKeyBuf.length && crypto.timingSafeEqual(clientKeyBuf, serverKeyBuf)) {
    return next();
  }

  return res.status(403).json({ ok: false, error: 'Invalid API key.' });
};

// ==============================================================================
// Helper: Resolve PBX Instance Details for Extension
// ==============================================================================
function resolvePbxForExtension(pbxId?: string): { id: string; name: string; server: string; port: number; transport: string } {
  const config = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const targetId = pbxId || 'default';

  try {
    const inst = systemDb.prepare('SELECT * FROM pbx_instances WHERE id = ? AND is_active = 1').get(targetId) as PbxInstanceRow | undefined;
    if (inst) {
      return {
        id: inst.id,
        name: inst.name,
        server: inst.host,
        port: inst.sip_port,
        transport: inst.sip_transport
      };
    }
  } catch {}

  return {
    id: 'default',
    name: 'Primary PBX Core',
    server: config.pbx_server,
    port: config.pbx_port,
    transport: config.pbx_transport
  };
}

// ==============================================================================
// Helper: Dispatch Branded PIN Reset Email to Customer
// ==============================================================================
async function dispatchPinResetEmail(
  toEmail: string,
  extension: string,
  displayName: string,
  pin: string,
  expiresAt: string,
  deepLink: string,
  serverCfg: ServerConfigRow
): Promise<boolean> {
  try {
    const smtpCfg: SmtpConfig = {
      host: serverCfg.smtp_host || '',
      port: serverCfg.smtp_port || 587,
      secure: serverCfg.smtp_secure === 1,
      user: serverCfg.smtp_user || '',
      pass: serverCfg.smtp_pass || '',
      from: serverCfg.smtp_from || `no-reply@${serverCfg.pbx_server || 'merlinsip.com'}`
    };

    const brandName = serverCfg.brand_name || 'MerlinSIP';
    const primaryColor = serverCfg.primary_color || '#2563EB';
    const supportEmail = serverCfg.support_email || 'support@merlinsip.com';

    const expiryFormatted = new Date(expiresAt).toUTCString();

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Provisioning PIN</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: ${primaryColor}; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">${brandName} Softphone</h1>
      <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0; font-size: 13.5px;">Customer Portal PIN Reset</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">Hello <strong>${displayName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #475569;">A request to reset your softphone provisioning PIN was received from your customer billing portal. Use the 8-digit PIN code below to connect your device:</p>
      
      <div style="background: #f1f5f9; border: 2px dashed ${primaryColor}; border-radius: 10px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Your 8-Digit Setup PIN</span>
        <span style="font-size: 32px; font-weight: 800; letter-spacing: 5px; color: ${primaryColor}; font-family: ui-monospace, monospace;">${pin}</span>
        <span style="display: block; font-size: 12px; color: #64748b; margin-top: 6px;">Assigned Extension: <strong>${extension}</strong></span>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <a href="${deepLink}" style="display: inline-block; background: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">Instant Softphone Auto-Setup →</a>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; font-size: 12.5px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;"><strong>Expiration:</strong> This PIN will expire on <strong>${expiryFormatted}</strong>.</p>
        <p style="margin: 0;">If you did not request this code, you can safely ignore this email. Your existing SIP credentials remain secure.</p>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11.5px; color: #94a3b8;">
      © ${new Date().getFullYear()} ${brandName} · Need help? Contact <a href="mailto:${supportEmail}" style="color: ${primaryColor};">${supportEmail}</a>
    </div>
  </div>
</body>
</html>`;

    const plainText = `Your ${brandName} Softphone Setup PIN\n\nExtension: ${extension}\nDisplay Name: ${displayName}\n8-Digit PIN: ${pin}\nAuto-Setup Link: ${deepLink}\nExpires: ${expiryFormatted}\n\nEnter this PIN in your MerlinSIP softphone to complete setup.`;

    const result = await sendEmail(smtpCfg, {
      to: toEmail,
      subject: `${brandName} Softphone Setup PIN for Ext ${extension}`,
      text: plainText,
      html: htmlBody
    });

    return result.success;
  } catch (err) {
    console.warn('[Billing API] Error sending PIN email:', err);
    return false;
  }
}

// ==============================================================================
// 1. BILLING SYSTEM MODULE API: Reset Provisioning PIN
// POST /api/v1/billing/reset-pin
//
// Designed specifically for WHMCS / Perfex CRM / Stripe / Custom Client Portals
// Supports lookup by extension number OR customer billing email.
// ==============================================================================
router.post('/api/v1/billing/reset-pin', apiKeyAuth, async (req: Request, res: Response) => {
  const { extension, email, expiryHours, dispatchEmail, pbxId, displayName, sipPassword, autoCreate } = req.body || {};

  if (!extension && !email) {
    return res.status(400).json({
      ok: false,
      error: 'Either "extension" or "email" is required to identify the account for PIN reset.'
    });
  }

  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;

  let extRecord: (ExtensionRow & { pbx_id?: string }) | undefined;

  // Case A: Specified by Extension
  if (extension) {
    const cleanExt = String(extension).trim();
    extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as any;

    if (!extRecord && (autoCreate || displayName || sipPassword)) {
      const generatedPwd = sipPassword || crypto.randomBytes(8).toString('hex');
      const name = displayName || `Extension ${cleanExt}`;
      const targetPbx = pbxId || 'default';
      const cleanEmail = email ? String(email).trim().toLowerCase() : '';

      systemDb.prepare(`
        INSERT INTO extensions (extension, sip_username, sip_password, display_name, email, pbx_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cleanExt, cleanExt, generatedPwd, name, cleanEmail, targetPbx);

      extRecord = {
        extension: cleanExt,
        sip_username: cleanExt,
        sip_password: generatedPwd,
        display_name: name,
        email: cleanEmail,
        pbx_id: targetPbx,
        is_active: 1
      };
    }
  }

  // Case B: Specified by Email (lookup extension registered to this customer)
  if (!extRecord && email) {
    const cleanEmail = String(email).trim().toLowerCase();
    const rows = systemDb.prepare(`
      SELECT * FROM extensions 
      WHERE LOWER(TRIM(email)) = ? AND is_active = 1
      ORDER BY extension ASC
    `).all(cleanEmail) as (ExtensionRow & { pbx_id?: string })[];

    if (rows && rows.length > 0) {
      extRecord = rows[0];
    } else {
      // Check contacts in vaultDb as fallback
      try {
        const contact = vaultDb.prepare(`
          SELECT extension, full_name as display_name, email 
          FROM contacts 
          WHERE LOWER(TRIM(email)) = ?
        `).get(cleanEmail) as any;

        if (contact && contact.extension) {
          extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(contact.extension) as any;
        }
      } catch {}
    }
  }

  if (!extRecord) {
    return res.status(404).json({
      ok: false,
      error: `No extension found matching criteria: extension="${extension || ''}", email="${email || ''}".`
    });
  }

  if (extRecord.is_active !== 1) {
    return res.status(403).json({
      ok: false,
      error: `Extension ${extRecord.extension} is currently suspended. Reactivate the extension before resetting its PIN.`
    });
  }

  // If email was provided in request and extension has none, store it for future self-service
  if (email && (!extRecord.email || !extRecord.email.trim())) {
    const cleanEmail = String(email).trim().toLowerCase();
    systemDb.prepare('UPDATE extensions SET email = ? WHERE extension = ?').run(cleanEmail, extRecord.extension);
    extRecord.email = cleanEmail;
  }

  const cleanExt = extRecord.extension;
  const hours = parseInt(String(expiryHours || 72), 10);
  const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  // Invalidate any existing unclaimed PINs for this extension
  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);

  // Insert fresh 8-digit PIN
  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, expires_at)
    VALUES (?, ?, ?)
  `).run(pin, cleanExt, expiresAt);

  // Resolve PBX Core for this extension
  const pbxInfo = resolvePbxForExtension(extRecord.pbx_id);

  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');
  const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(baseHandlerUrl)}`;

  // Optional: Dispatch email to customer
  let emailDispatched = false;
  const recipientEmail = (extRecord.email || email || '').trim();
  if (dispatchEmail && recipientEmail && recipientEmail.includes('@')) {
    emailDispatched = await dispatchPinResetEmail(
      recipientEmail,
      cleanExt,
      extRecord.display_name,
      pin,
      expiresAt,
      deepLink,
      serverCfg
    );
  }

  logActivity('BILLING_PIN_RESET', `Provisioning PIN reset for Ext ${cleanExt} (${extRecord.display_name}) via Billing API`, req.ip);
  broadcastDeviceLog('BILLING', 'SUCCESS', `[Billing API] Reset provisioning PIN for Ext ${cleanExt} [${pin}] (Expires in ${hours}h)`, {
    deviceIdentifier: `Ext ${cleanExt}`,
    ipAddress: req.ip,
    metadata: { extension: cleanExt, code: pin, emailDispatched, pbx: pbxInfo.name }
  });

  const welcomeCard = `========================================\n${serverCfg.brand_name || 'MerlinSIP'} Softphone Provisioning Card\n========================================\nUser / Display Name: ${extRecord.display_name}\nExtension Number:    ${cleanExt}\n8-Digit Setup PIN:   ${pin}\nAuto-Setup Link:     ${deepLink}\nPBX Server:          ${pbxInfo.server}:${pbxInfo.port} (${pbxInfo.transport})\nHandler Gateway:     ${baseHandlerUrl}\nCode Expiration:     ${expiresAt}\n\nInstructions:\n1. Download or open MerlinSIP Softphone.\n2. In the setup prompt, enter the 8-Digit PIN [${pin}] or click the Auto-Setup link above.\n3. Your softphone will configure its SIP credentials and connect automatically!`;

  return res.json({
    ok: true,
    success: true,
    message: `Provisioning PIN [${pin}] issued successfully for Extension ${cleanExt}.`,
    pin,
    code: pin,
    extension: cleanExt,
    displayName: extRecord.display_name,
    email: extRecord.email || '',
    expiresAt,
    expiryHours: hours,
    deepLink,
    handlerUrl: baseHandlerUrl,
    pbx: pbxInfo,
    emailDispatched,
    welcomeCard
  });
});

// ==============================================================================
// 2. BILLING SYSTEM MODULE API: Customer Extensions & PINs Lookup / Bulk Reset
// POST /api/v1/billing/customer/pins
//
// Retrieves or resets all lines/extensions associated with a customer email.
// ==============================================================================
router.post('/api/v1/billing/customer/pins', apiKeyAuth, async (req: Request, res: Response) => {
  const { email, action, expiryHours, dispatchEmail } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ ok: false, error: 'Valid customer email is required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');

  const extensions = systemDb.prepare(`
    SELECT e.extension, e.display_name, e.sip_username, e.email, e.is_active, e.pbx_id,
           (SELECT p.code FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP) LIMIT 1) as active_pin,
           (SELECT p.expires_at FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP) LIMIT 1) as pin_expires_at
    FROM extensions e
    WHERE LOWER(TRIM(e.email)) = ?
    ORDER BY e.extension ASC
  `).all(cleanEmail) as any[];

  if (!extensions || extensions.length === 0) {
    return res.status(404).json({ ok: false, error: `No extensions found registered to customer email: ${cleanEmail}` });
  }

  const shouldReset = action === 'reset';
  const hours = parseInt(String(expiryHours || 72), 10);
  const results = [];

  for (const ext of extensions) {
    let pin = ext.active_pin;
    let expiresAt = ext.pin_expires_at;

    if (shouldReset || !pin) {
      pin = Math.floor(10000000 + Math.random() * 90000000).toString();
      expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

      systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(ext.extension);
      systemDb.prepare(`
        INSERT INTO softphone_pins (code, extension, expires_at)
        VALUES (?, ?, ?)
      `).run(pin, ext.extension, expiresAt);
    }

    const pbxInfo = resolvePbxForExtension(ext.pbx_id);
    const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(baseHandlerUrl)}`;

    results.push({
      extension: ext.extension,
      displayName: ext.display_name,
      isActive: ext.is_active === 1,
      code: pin,
      pin,
      expiresAt,
      deepLink,
      pbx: pbxInfo
    });

    if (dispatchEmail && shouldReset) {
      await dispatchPinResetEmail(cleanEmail, ext.extension, ext.display_name, pin, expiresAt, deepLink, serverCfg);
    }
  }

  return res.json({
    ok: true,
    email: cleanEmail,
    action: shouldReset ? 'reset' : 'fetch',
    count: results.length,
    extensions: results
  });
});

// ==============================================================================
// 3. BILLING SYSTEM MODULE API: Revoke Provisioning PIN
// POST /api/v1/billing/revoke-pin
// ==============================================================================
router.post('/api/v1/billing/revoke-pin', apiKeyAuth, (req: Request, res: Response) => {
  const { extension, code } = req.body || {};
  if (!extension && !code) {
    return res.status(400).json({ ok: false, error: 'Either "extension" or "code" is required to revoke a PIN.' });
  }

  let deletedCount = 0;
  if (extension) {
    const resRun = systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(String(extension).trim());
    deletedCount += resRun.changes;
  }
  if (code) {
    const resRun = systemDb.prepare('DELETE FROM softphone_pins WHERE code = ? AND claimed = 0').run(String(code).trim());
    deletedCount += resRun.changes;
  }

  logActivity('BILLING_PIN_REVOKED', `Revoked ${deletedCount} PIN(s) via Billing API for ext=${extension || 'any'}, code=${code || 'any'}`, req.ip);
  return res.json({
    ok: true,
    message: `Revoked ${deletedCount} active unclaimed provisioning PIN(s).`,
    revokedCount: deletedCount
  });
});

// ==============================================================================
// 4. BILLING SYSTEM MODULE API: Get Single Extension Details & Line Status
// GET /api/v1/billing/extension/:ext
// ==============================================================================
router.get('/api/v1/billing/extension/:ext', apiKeyAuth, (req: Request, res: Response) => {
  const cleanExt = String(req.params.ext).trim();
  const ext = systemDb.prepare(`
    SELECT e.extension, e.sip_username, e.display_name, e.email, e.is_active, e.pbx_id,
           e.last_registered_at, e.last_ip, e.user_agent, e.created_at,
           (SELECT p.code FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP) LIMIT 1) as active_pin,
           (SELECT p.expires_at FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP) LIMIT 1) as pin_expires_at,
           (SELECT COUNT(*) FROM physical_handsets h WHERE h.extension = e.extension) as bound_handsets
    FROM extensions e
    WHERE e.extension = ?
  `).get(cleanExt) as any;

  if (!ext) {
    return res.status(404).json({ ok: false, error: `Extension ${cleanExt} not found.` });
  }

  const pbxInfo = resolvePbxForExtension(ext.pbx_id);
  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');

  return res.json({
    ok: true,
    extension: ext.extension,
    displayName: ext.display_name,
    sipUsername: ext.sip_username,
    email: ext.email || '',
    isActive: ext.is_active === 1,
    boundHandsets: ext.bound_handsets || 0,
    lastRegisteredAt: ext.last_registered_at,
    lastIp: ext.last_ip,
    userAgent: ext.user_agent,
    activePin: ext.active_pin || null,
    pinExpiresAt: ext.pin_expires_at || null,
    deepLink: ext.active_pin ? `merlinsip://provision?code=${ext.active_pin}&handler=${encodeURIComponent(baseHandlerUrl)}` : null,
    pbx: pbxInfo
  });
});

// ==============================================================================
// 5. BILLING SYSTEM MODULE API: Suspend or Reactivate Service
// POST /api/v1/billing/extension/:ext/status
//
// Perfect for billing modules to suspend accounts for non-payment or restore on pay
// ==============================================================================
router.post('/api/v1/billing/extension/:ext/status', apiKeyAuth, (req: Request, res: Response) => {
  const cleanExt = String(req.params.ext).trim();
  const { isActive, status } = req.body || {};

  const existing = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as ExtensionRow | undefined;
  if (!existing) {
    return res.status(404).json({ ok: false, error: `Extension ${cleanExt} not found.` });
  }

  const shouldBeActive = isActive !== undefined ? Boolean(isActive) : (String(status).toLowerCase() === 'active');
  const activeInt = shouldBeActive ? 1 : 0;

  systemDb.prepare('UPDATE extensions SET is_active = ? WHERE extension = ?').run(activeInt, cleanExt);

  if (!shouldBeActive) {
    // Invalidate any unclaimed PINs when suspended
    systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);
  }

  logActivity('BILLING_STATUS_CHANGE', `Extension ${cleanExt} service status set to ${shouldBeActive ? 'ACTIVE' : 'SUSPENDED'} via Billing API`, req.ip);
  broadcastDeviceLog('BILLING', shouldBeActive ? 'INFO' : 'WARN', `[Billing API] Extension ${cleanExt} status updated: ${shouldBeActive ? 'ACTIVE' : 'SUSPENDED'}`, {
    deviceIdentifier: `Ext ${cleanExt}`,
    ipAddress: req.ip
  });

  return res.json({
    ok: true,
    extension: cleanExt,
    isActive: shouldBeActive,
    status: shouldBeActive ? 'active' : 'suspended',
    message: `Extension ${cleanExt} is now ${shouldBeActive ? 'active' : 'suspended'}.`
  });
});

// ==============================================================================
// 6. BILLING SYSTEM MODULE API: Query Customer Extensions
// GET /api/v1/billing/extensions
// ==============================================================================
router.get('/api/v1/billing/extensions', apiKeyAuth, (req: Request, res: Response) => {
  const emailFilter = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
  const pbxFilter = req.query.pbxId ? String(req.query.pbxId).trim() : null;
  const statusFilter = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 100), 10)));

  let query = `
    SELECT e.extension, e.display_name, e.sip_username, e.email, e.is_active, e.pbx_id,
           e.last_registered_at,
           (SELECT p.code FROM softphone_pins p WHERE p.extension = e.extension AND p.claimed = 0 AND (p.expires_at IS NULL OR p.expires_at > CURRENT_TIMESTAMP) LIMIT 1) as active_pin,
           (SELECT COUNT(*) FROM physical_handsets h WHERE h.extension = e.extension) as bound_handsets
    FROM extensions e
    WHERE 1=1
  `;
  const params: any[] = [];

  if (emailFilter) {
    query += ' AND LOWER(TRIM(e.email)) = ?';
    params.push(emailFilter);
  }
  if (pbxFilter) {
    query += ' AND e.pbx_id = ?';
    params.push(pbxFilter);
  }
  if (statusFilter === 'active') {
    query += ' AND e.is_active = 1';
  } else if (statusFilter === 'suspended' || statusFilter === 'inactive') {
    query += ' AND e.is_active = 0';
  }

  query += ' ORDER BY e.extension ASC LIMIT ?';
  params.push(limit);

  const rows = systemDb.prepare(query).all(...params) as any[];

  return res.json({
    ok: true,
    count: rows.length,
    extensions: rows.map(r => ({
      ...r,
      isActive: r.is_active === 1,
      pbx: resolvePbxForExtension(r.pbx_id)
    }))
  });
});

// ==============================================================================
// 7. BILLING SYSTEM MODULE API: Interactive Documentation & Endpoint Schema
// GET /api/v1/billing/docs
// ==============================================================================
router.get('/api/v1/billing/docs', (req: Request, res: Response) => {
  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');

  return res.json({
    service: 'MerlinSIP / CKM Billing System Integration API',
    version: '1.4.0',
    handlerUrl: baseHandlerUrl,
    authHeader: 'X-API-Key: ckm_live_...',
    endpoints: [
      {
        path: 'POST /api/v1/billing/reset-pin',
        description: 'Primary customer self-service endpoint. Resets and returns an 8-digit provisioning PIN for an extension or email.',
        body: {
          extension: 'string (optional if email provided)',
          email: 'string (optional if extension provided)',
          expiryHours: 'number (optional, default: 72)',
          dispatchEmail: 'boolean (optional, default: false — emails PIN to customer)',
          pbxId: 'string (optional, maps to specific PBX cluster core)',
          displayName: 'string (optional)',
          sipPassword: 'string (optional)'
        }
      },
      {
        path: 'POST /api/v1/billing/customer/pins',
        description: 'Returns or resets all lines and active PINs associated with a customer email address.',
        body: {
          email: 'string (required)',
          action: "'fetch' | 'reset' (default: 'fetch')",
          expiryHours: 'number (default: 72)',
          dispatchEmail: 'boolean (default: false)'
        }
      },
      {
        path: 'POST /api/v1/billing/revoke-pin',
        description: 'Immediately revokes/cancels active unclaimed PINs.',
        body: {
          extension: 'string (optional)',
          code: 'string (optional)'
        }
      },
      {
        path: 'GET /api/v1/billing/extension/:ext',
        description: 'Fetches real-time status of a single extension, bound handsets, and PBX mapping.'
      },
      {
        path: 'POST /api/v1/billing/extension/:ext/status',
        description: 'Suspends or reactivates an extension (e.g. for non-payment).',
        body: {
          isActive: 'boolean (required)'
        }
      },
      {
        path: 'GET /api/v1/billing/extensions',
        description: 'List extensions with optional query filters (?email=...&pbxId=...&status=active).'
      },
      {
        path: 'GET /api/v1/billing/whmcs-sample',
        description: 'Downloads ready-to-run PHP source code for WHMCS / Client Portal integration.'
      }
    ]
  });
});

// ==============================================================================
// 8. BILLING SYSTEM MODULE API: Ready-To-Use WHMCS / PHP Module Sample
// GET /api/v1/billing/whmcs-sample
// ==============================================================================
router.get('/api/v1/billing/whmcs-sample', (req: Request, res: Response) => {
  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');

  const phpModule = `<?php
/**
 * MerlinSIP / CKM Handler - WHMCS & Client Portal Provisioning Module
 * 
 * Drop this file into your WHMCS custom modules or customer billing portal
 * to allow clients to reset their 8-digit softphone provisioning PINs with one click.
 */

class MerlinSipBillingClient {
    private $handlerUrl = '${baseHandlerUrl}';
    private $apiKey;

    public function __construct($apiKey) {
        $this->apiKey = $apiKey;
    }

    /**
     * Reset 8-digit Softphone PIN for a customer extension or email
     */
    public function resetPin($extension = null, $email = null, $dispatchEmail = false, $expiryHours = 72) {
        $payload = [
            'extension'     => $extension,
            'email'         => $email,
            'dispatchEmail' => (bool)$dispatchEmail,
            'expiryHours'   => (int)$expiryHours
        ];

        return $this->request('POST', '/api/v1/billing/reset-pin', $payload);
    }

    /**
     * Get all active extensions and provisioning PINs for a customer
     */
    public function getCustomerPins($email, $action = 'fetch') {
        return $this->request('POST', '/api/v1/billing/customer/pins', [
            'email'  => $email,
            'action' => $action
        ]);
    }

    /**
     * Suspend or Unsuspend an extension (invoice overdue / paid)
     */
    public function setExtensionStatus($extension, $isActive) {
        return $this->request('POST', '/api/v1/billing/extension/' . urlencode($extension) . '/status', [
            'isActive' => (bool)$isActive
        ]);
    }

    /**
     * Query live extension status
     */
    public function getExtension($extension) {
        return $this->request('GET', '/api/v1/billing/extension/' . urlencode($extension));
    }

    private function request($method, $endpoint, $data = null) {
        $url = rtrim($this->handlerUrl, '/') . $endpoint;
        $ch = curl_init($url);

        $headers = [
            'X-API-Key: ' . $this->apiKey,
            'Content-Type: application/json',
            'Accept: application/json'
        ];

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($data) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            }
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            return ['ok' => false, 'error' => 'cURL Error: ' . $err];
        }

        $decoded = json_decode($response, true);
        if ($httpCode >= 400) {
            return ['ok' => false, 'error' => $decoded['error'] ?? ('HTTP ' . $httpCode), 'data' => $decoded];
        }

        return $decoded;
    }
}

// ==============================================================================
// Example Usage:
// ==============================================================================
/*
$client = new MerlinSipBillingClient('${serverCfg.api_key || 'YOUR_CKM_LIVE_API_KEY'}');

// 1. Reset PIN by extension:
$result = $client->resetPin('101', 'client@company.com', true);
if ($result['ok']) {
    echo "New PIN: " . $result['pin'] . "\\n";
    echo "Deep Link: " . $result['deepLink'] . "\\n";
}

// 2. Reset PIN by customer billing email:
$result = $client->resetPin(null, 'client@company.com', true);

// 3. Suspend on invoice non-payment:
$client->setExtensionStatus('101', false);
*/
`;

  res.setHeader('Content-Type', 'application/x-php; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="MerlinSipBillingClient.php"');
  return res.send(phpModule);
});

// ==============================================================================
// Legacy Inbound Provisioning API Endpoints (Preserved for backwards compatibility)
// ==============================================================================
// POST /api/v1/integrations/provision-user
router.post('/api/v1/integrations/provision-user', apiKeyAuth, async (req: Request, res: Response) => {
  const { extension, displayName, sipPassword, expiryHours, queryPbx, amiConfig } = req.body;
  if (!extension) {
    return res.status(400).json({ ok: false, error: 'Extension number is required.' });
  }

  const cleanExt = String(extension).trim();
  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;

  let extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as ExtensionRow | undefined;

  if (!extRecord && queryPbx) {
    const ami: AmiConfig = {
      host: amiConfig?.host || serverCfg.pbx_server,
      port: parseInt(amiConfig?.port || '5038', 10),
      username: amiConfig?.username || 'admin',
      secret: amiConfig?.secret || 'amp111'
    };
    await syncExtensionsFromAsterisk(ami);
    extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as ExtensionRow | undefined;
  }

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
      display_name: name,
      is_active: 1
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

  const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  const hours = parseInt(expiryHours || '72', 10);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);
  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, expires_at)
    VALUES (?, ?, ?)
  `).run(pin, cleanExt, expiresAt);

  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');
  const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(baseHandlerUrl)}`;
  const welcomeCard = `========================================\nMerlinSIP Softphone Configuration Card\n========================================\nUser / Display Name: ${extRecord.display_name}\nExtension Number:    ${cleanExt}\n8-Digit Setup PIN:   ${pin}\nAuto-Setup Link:     ${deepLink}\nHandler Gateway:     ${baseHandlerUrl}\nCode Expiration:     ${expiresAt}\n\nInstructions:\n1. Download or open MerlinSIP Softphone.\n2. In the setup prompt, enter the 8-Digit PIN [${pin}] or click the Auto-Setup link above.\n3. Your softphone will configure its SIP credentials and connect automatically!`;

  broadcastDeviceLog('SOFTPHONE', 'SUCCESS', `[Inbound API Provisioning] External integration issued PIN [${pin}] for Ext ${cleanExt} (${extRecord.display_name})`, {
    deviceIdentifier: `Ext ${cleanExt}`,
    ipAddress: req.ip,
    metadata: { extension: cleanExt, code: pin, expiresAt }
  });

  return res.json({
    ok: true,
    extension: cleanExt,
    displayName: extRecord.display_name,
    code: pin,
    expiresAt,
    handlerUrl: baseHandlerUrl,
    pbxServer: serverCfg.pbx_server,
    deepLink,
    userWelcomeCard: welcomeCard
  });
});

// GET /api/v1/integrations/extension/:ext/code
router.get('/api/v1/integrations/extension/:ext/code', apiKeyAuth, (req: Request, res: Response) => {
  const cleanExt = String(req.params.ext).trim();
  const extRecord = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(cleanExt) as ExtensionRow | undefined;
  if (!extRecord) {
    return res.status(404).json({ ok: false, error: `Extension ${cleanExt} not found.` });
  }

  const serverCfg = (systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow | undefined) || defaultServerConfig;
  const baseHandlerUrl = (serverCfg.data_handler_url || `https://${req.get('host') || 'localhost'}`).trim().replace(/\/$/, '');

  let pinRecord = systemDb.prepare(`
    SELECT * FROM softphone_pins 
    WHERE extension = ? AND claimed = 0 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY created_at DESC LIMIT 1
  `).get(cleanExt) as SoftphonePinRow | undefined;

  let pin = pinRecord?.code;
  let expiresAt = pinRecord?.expires_at;

  if (!pin) {
    pin = Math.floor(10000000 + Math.random() * 90000000).toString();
    expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(cleanExt);
    systemDb.prepare('INSERT INTO softphone_pins (code, extension, expires_at) VALUES (?, ?, ?)').run(pin, cleanExt, expiresAt);
    broadcastDeviceLog('SOFTPHONE', 'SUCCESS', `[Inbound API Provisioning] Setup PIN [${pin}] refreshed for Ext ${cleanExt}`, {
      deviceIdentifier: `Ext ${cleanExt}`,
      ipAddress: req.ip
    });
  }

  const deepLink = `merlinsip://provision?code=${pin}&handler=${encodeURIComponent(baseHandlerUrl)}`;

  return res.json({
    ok: true,
    extension: cleanExt,
    displayName: extRecord.display_name,
    code: pin,
    expiresAt,
    handlerUrl: baseHandlerUrl,
    deepLink
  });
});

export default router;
