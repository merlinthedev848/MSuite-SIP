import { Router, Request, Response } from 'express';
import systemDb from '../database/systemDb';

const router = Router();

// Anti-Brute-Force Rate Limiter: Max 5 failed attempts per IP per minute
interface FailedAttempt {
  count: number;
  resetAt: number;
}
const failedPinAttempts = new Map<string, FailedAttempt>();

// 1. Softphone Auto-Provisioning by 8-Digit PIN
// Handled for multiple endpoint patterns matching desktop client
const handlePinProvision = (req: Request, res: Response) => {
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
  const now = Date.now();

  const attemptRec = failedPinAttempts.get(clientIp);
  if (attemptRec) {
    if (now < attemptRec.resetAt && attemptRec.count >= 5) {
      const waitSec = Math.ceil((attemptRec.resetAt - now) / 1000);
      return res.status(429).json({
        ok: false,
        error: `Too many failed provisioning PIN attempts. Rate limited for ${waitSec} seconds.`
      });
    } else if (now >= attemptRec.resetAt) {
      failedPinAttempts.delete(clientIp);
    }
  }

  const rawCode = req.params.code || req.body.code || req.query.code;
  if (!rawCode) {
    return res.status(400).json({ ok: false, error: 'Provisioning PIN is required.' });
  }

  const cleanedCode = String(rawCode).replace(/\D/g, '');
  if (cleanedCode.length !== 8) {
    return res.status(400).json({ ok: false, error: 'Provisioning PIN must be exactly 8 digits.' });
  }

  // Look up PIN
  const pinRecord = systemDb.prepare(`
    SELECT p.code, p.extension, p.claimed, p.expires_at,
           e.sip_username, e.sip_password, e.display_name, e.is_active
    FROM softphone_pins p
    JOIN extensions e ON p.extension = e.extension
    WHERE p.code = ?
  `).get(cleanedCode) as any;

  if (!pinRecord) {
    const cur = failedPinAttempts.get(clientIp);
    if (!cur) {
      failedPinAttempts.set(clientIp, { count: 1, resetAt: now + 60000 });
    } else {
      cur.count++;
    }
    return res.status(404).json({ ok: false, error: 'Invalid or expired provisioning PIN.' });
  }

  // Clear failed attempts counter on success
  failedPinAttempts.delete(clientIp);

  if (pinRecord.is_active !== 1) {
    return res.status(403).json({ ok: false, error: 'This extension has been deactivated.' });
  }

  // Check expiration if set
  if (pinRecord.expires_at) {
    const expires = new Date(pinRecord.expires_at).getTime();
    if (Date.now() > expires) {
      return res.status(410).json({ ok: false, error: 'This provisioning PIN has expired.' });
    }
  }

  // Mark PIN as claimed
  systemDb.prepare('UPDATE softphone_pins SET claimed = 1 WHERE code = ?').run(cleanedCode);

  // Fetch current server config
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  return res.json({
    ok: true,
    message: 'Extension provisioned successfully.',
    sip: {
      server: config.pbx_server,
      port: config.pbx_port,
      domain: config.pbx_server,
      transport: config.pbx_transport,
      extension: pinRecord.extension,
      username: pinRecord.sip_username,
      password: pinRecord.sip_password,
      display_name: pinRecord.display_name,
      data_handler_url: config.data_handler_url
    }
  });
};

router.post('/sip/provision/:code', handlePinProvision);
router.post('/sip/register/:code', handlePinProvision);
router.post('/sip/autoprovision/:code', handlePinProvision);
router.post('/sip/details/:code', handlePinProvision);
router.post('/api/v1/provision', handlePinProvision);

// 2. Dynamic 10-Minute Config Sync Endpoint
router.get('/api/v1/config/sync', (req: Request, res: Response) => {
  res.set('Cache-Control', 'public, max-age=300');
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

  return res.json({
    ok: true,
    version: '1.4.0',
    sip: {
      server: config.pbx_server,
      port: config.pbx_port,
      transport: config.pbx_transport,
      domain: config.pbx_server
    },
    data_handler: {
      socket_url: config.data_handler_url,
      upload_endpoint: `${config.data_handler_url}/files/upload`
    },
    features: {
      chat_enabled: true,
      video_calls_enabled: true,
      remote_phonebook_enabled: true
    }
  });
});

export default router;
