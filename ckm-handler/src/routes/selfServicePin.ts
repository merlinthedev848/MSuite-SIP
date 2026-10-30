import { Router, Request, Response } from 'express';
import systemDb, { logActivity } from '../database/systemDb';
import vaultDb from '../database/vaultDb';
import { sendEmail, SmtpConfig } from '../services/emailService';
import { broadcastDeviceLog } from '../services/telemetryStream';
import { ServerConfigRow } from '../types/models';

const router = Router();

// In-memory rate limiting: max 3 requests per 10 minutes per extension/IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxLimit = 3, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxLimit) {
    return false;
  }
  entry.count++;
  return true;
}

// Clean up stale rate limits every 15 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
}, 15 * 60 * 1000);
cleanupTimer.unref();

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const [user, domain] = parts;
  const maskedUser = user.length <= 2 
    ? user[0] + '***' 
    : user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

interface ExtensionInfo {
  extension: string;
  display_name: string;
  email?: string;
}

interface VaultContactInfo {
  extension: string;
  full_name?: string;
  email?: string;
}

/**
 * POST /api/v1/self-service/request-pin
 * Customer Self-Service PIN Generation Endpoint
 * Enforces email dispatch ONLY. PIN code is never returned in HTTP response.
 */
router.post('/api/v1/self-service/request-pin', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rawExt = String(req.body?.extension || '').trim();

  if (!rawExt || !/^\d{2,10}$/.test(rawExt)) {
    return res.status(400).json({
      ok: false,
      error: 'Please enter a valid numeric extension number (e.g. 101, 709).'
    });
  }

  // Rate Limiting (per IP and per Extension)
  if (!checkRateLimit(`ip_${ip}`, 10) || !checkRateLimit(`ext_${rawExt}`, 3)) {
    return res.status(429).json({
      ok: false,
      error: 'Too many PIN requests submitted. Please wait 10 minutes before requesting another code.'
    });
  }

  // 1. Check extension existence in systemDb
  const extRow = systemDb.prepare(`
    SELECT extension, display_name, email 
    FROM extensions 
    WHERE extension = ? AND is_active = 1
  `).get(rawExt) as ExtensionInfo | undefined;

  // 2. Check vaultDb contacts as secondary source
  const contactRow = vaultDb.prepare(`
    SELECT extension, full_name, email 
    FROM contacts 
    WHERE extension = ?
  `).get(rawExt) as VaultContactInfo | undefined;

  if (!extRow && !contactRow) {
    return res.status(404).json({
      ok: false,
      error: `Extension ${rawExt} was not found in the communications directory. Please check the number or contact IT support.`
    });
  }

  const displayName = extRow?.display_name || contactRow?.full_name || `Extension ${rawExt}`;
  const registeredEmail = (extRow?.email || contactRow?.email || '').trim();

  const rawEmailInput = String(req.body?.email || '').trim().toLowerCase();
  if (!rawEmailInput || !rawEmailInput.includes('@')) {
    return res.status(400).json({
      ok: false,
      error: 'Please enter your registered email address.'
    });
  }

  // 3. Security Check: Email MUST exist on file
  if (!registeredEmail || !registeredEmail.includes('@')) {
    return res.status(422).json({
      ok: false,
      error: `No registered email address is on file for Extension ${rawExt}. For security, provisioning PINs cannot be generated without a verified email on file. Please contact your system administrator to add your email address.`
    });
  }

  // 3b. Verification: Customer-entered email MUST match registered email on file
  if (rawEmailInput !== registeredEmail.toLowerCase()) {
    broadcastDeviceLog('SECURITY', 'WARN', `[PIN Request Rejected] Extension ${rawExt}: entered email "${rawEmailInput}" does not match registered record on PBX`, {
      deviceIdentifier: `Ext ${rawExt}`,
      ipAddress: ip
    });
    return res.status(403).json({
      ok: false,
      error: `The email address entered does not match the registered email address on file for Extension ${rawExt}. Please enter the correct email or contact IT support.`
    });
  }

  // 4. Invalidate previous unclaimed PINs for this extension
  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ? AND claimed = 0').run(rawExt);

  // 5. Generate secure random 8-digit PIN
  const pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24-hour validity

  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, expires_at)
    VALUES (?, ?, ?)
  `).run(pin, rawExt, expiresAt);

  // 6. Fetch Server Branding & SMTP configuration
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as ServerConfigRow & {
    smtp_host?: string;
    smtp_port?: number;
    smtp_secure?: number;
    smtp_user?: string;
    smtp_pass?: string;
    smtp_from?: string;
  };

  const brandName = config.brand_name || 'MerlinSIP';
  const dataHandlerUrl = config.data_handler_url || `https://${req.get('host') || 'localhost'}`;
  const primaryColor = config.primary_color || '#2563EB';
  const supportEmail = config.support_email || 'support@merlinsip.com';

  const smtpConfig: SmtpConfig = {
    host: config.smtp_host || '',
    port: config.smtp_port || 587,
    secure: config.smtp_secure === 1,
    user: config.smtp_user || '',
    pass: config.smtp_pass || '',
    from: config.smtp_from || `${brandName} Telephony <no-reply@${req.get('host')?.split(':')[0] || 'telephony'}>`
  };

  const formattedPin = `${pin.substring(0, 4)} ${pin.substring(4)}`;
  const setupUrl = `${dataHandlerUrl.replace(/\/+$/, '')}/sip/provision/${pin}`;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${brandName} Softphone Provisioning Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 30px 15px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background-color: ${primaryColor}; padding: 24px 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">${brandName} Communications</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0 0; font-size: 13px;">Softphone Self-Service Provisioning</p>
    </div>
    
    <div style="padding: 30px;">
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5;">Hello <strong>${displayName}</strong>,</p>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #475569;">
        A new setup PIN code was requested for your telephone extension <strong>${rawExt}</strong>. Use this one-time code to connect your MerlinSIP desktop softphone.
      </p>

      <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; display: block; margin-bottom: 6px;">Your 8-Digit Provisioning PIN</span>
        <div style="font-size: 32px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; letter-spacing: 4px; color: #0f172a;">${formattedPin}</div>
        <span style="font-size: 12px; color: #e11d48; margin-top: 8px; display: block;">Expires in 24 hours (Single use)</span>
      </div>

      <h3 style="font-size: 14px; margin: 0 0 10px 0; color: #0f172a;">How to activate:</h3>
      <ol style="margin: 0 0 24px 0; padding-left: 20px; font-size: 13.5px; line-height: 1.6; color: #334155;">
        <li>Open your <strong>${brandName}</strong> softphone application on your computer.</li>
        <li>Select <strong>Quick Provision with PIN</strong>.</li>
        <li>Enter Extension <strong>${rawExt}</strong> and the 8-digit PIN above.</li>
      </ol>

      <div style="text-align: center; margin: 25px 0;">
        <a href="${setupUrl}" style="background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">
          ⚡ Auto-Configure My Softphone
        </a>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 25px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;"><strong>Security Notice:</strong> If you did not request this PIN, no action is needed. Your existing configuration remains active. You can report unauthorized requests to <a href="mailto:${supportEmail}" style="color: #64748b;">${supportEmail}</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  // 7. Dispatch Email
  const emailResult = await sendEmail(smtpConfig, {
    to: registeredEmail,
    subject: `Your ${brandName} Softphone PIN Code (Ext ${rawExt})`,
    text: `Hello ${displayName},\n\nYour softphone provisioning PIN for extension ${rawExt} is: ${pin}\n\nThis PIN is valid for 24 hours.\n\nOpen your softphone, select 'Quick Provision with PIN', and enter Extension ${rawExt} with PIN ${pin}.\n\nDirect Setup Link: ${setupUrl}\n`,
    html: emailHtml
  });

  // 8. Audit Logging & Real-Time Telemetry
  broadcastDeviceLog('SOFTPHONE', emailResult.success ? 'INFO' : 'WARN', `[Self-Service PIN] PIN code generated for Ext ${rawExt}. Email status to ${maskEmail(registeredEmail)}: ${emailResult.message}`, {
    deviceIdentifier: `Ext ${rawExt}`,
    ipAddress: ip,
    metadata: { extension: rawExt, maskedEmail: maskEmail(registeredEmail), emailDelivered: emailResult.success }
  });

  logActivity('PIN_SELF_SERVICE_REQUEST', `Ext ${rawExt} requested setup PIN. Dispatched to ${maskEmail(registeredEmail)}. Result: ${emailResult.message}`, ip);

  // 9. Response to client: NOTICE: PIN IS EXCLUDED!
  return res.json({
    ok: true,
    message: `A new 8-digit setup PIN has been generated and sent to the verified email on file for extension ${rawExt}.`,
    maskedEmail: maskEmail(registeredEmail),
    emailDelivered: emailResult.success,
    emailStatus: emailResult.message
  });
});

export default router;
