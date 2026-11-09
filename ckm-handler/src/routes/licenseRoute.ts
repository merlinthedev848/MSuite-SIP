import { Router, Request, Response } from 'express';
import systemDb, { logActivity } from '../database/systemDb';
import { ServerConfigRow } from '../types/models';
import { broadcastDeviceLog } from '../services/telemetryStream';

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

const getServerConfigStmt = systemDb.prepare(`
  SELECT * FROM server_config WHERE id = 1
`);

/**
 * Validates, activates, or verifies client and softphone licenses
 * Replaces legacy accounts.chriskendall.media endpoints
 */
const handleLicenseCheck = (req: Request, res: Response) => {
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rawKey = req.body?.license_key || req.body?.key || req.body?.token || req.query?.license_key || req.query?.key || req.query?.token;
  const productId = req.body?.product_id || req.query?.product_id || 'merlin-sip';
  const machineId = req.body?.machine_id || req.query?.machine_id || '';
  const softwareVersion = req.body?.software_version || req.query?.software_version || '';
  const localKey = req.body?.local_key || req.query?.local_key || '';

  const config = (getServerConfigStmt.get() as ServerConfigRow | undefined) || defaultServerConfig;
  const key = String(rawKey || '').trim();

  const upperKey = key.toUpperCase();
  if (upperKey === 'REVOKED' || upperKey === 'EXPIRED' || upperKey === 'SUSPENDED') {
    broadcastDeviceLog('SECURITY', 'WARN', `License verification rejected explicitly suspended key: ${key}`, { ipAddress: clientIp });
    return res.status(403).json({
      success: false,
      valid: false,
      active: false,
      status: 'Suspended',
      verify_status: 'Suspended',
      license_status: 'Suspended',
      message: 'The license key has been revoked or suspended.'
    });
  }

  // 1. Managed & Local developer bypass, or matching system configured license key
  const isManaged = !key || key.startsWith('MANAGED-') || key.startsWith('DEV-') || key.startsWith('LOCAL-') || key.startsWith('TEST-');
  const matchesServerConfig = config.license_key && key.toLowerCase() === config.license_key.trim().toLowerCase();
  const isValidFormat = key.length >= 10 && /^[A-Z0-9-]+$/i.test(key);

  const isAccepted = isManaged || matchesServerConfig || isValidFormat;

  if (!isAccepted) {
    broadcastDeviceLog('SECURITY', 'WARN', `Invalid license key format or key rejected from ${clientIp}: ${key}`, { ipAddress: clientIp });
    return res.status(400).json({
      success: false,
      valid: false,
      active: false,
      status: 'Invalid',
      verify_status: 'Invalid',
      license_status: 'Invalid',
      message: 'Enter a valid license key.'
    });
  }

  const baseHandlerUrl = (config.data_handler_url || 'https://handler.chriskendall.media').trim().replace(/\/$/, '');
  const companyName = config.brand_name || 'Chris Kendall Media Services';
  const generatedLocalKey = localKey || `CKM-LOCAL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  logActivity('LICENSE_VERIFIED', `License [${key || 'MANAGED'}] verified for ${productId} (v${softwareVersion}) from ${clientIp}`, clientIp);

  return res.json({
    success: true,
    valid: true,
    active: true,
    status: 'Licensed',
    verify_status: 'Valid',
    license_status: 'Active',
    message: 'License verified successfully by CKM Handler.',
    requires_activation: false,
    local_key: generatedLocalKey,
    buyer: companyName,
    buyer_email: 'support@chriskendall.media',
    licensee: {
      name: companyName,
      email: 'support@chriskendall.media',
      company: companyName
    },
    contractor_profile: {
      handler_url: baseHandlerUrl,
      sip_server: config.pbx_server,
      sip_port: config.pbx_port,
      sip_transport: config.pbx_transport,
      company_name: companyName
    }
  });
};

// Mount endpoints matching legacy accounts.chriskendall.media
router.post('/license/verify', handleLicenseCheck);
router.get('/license/verify', handleLicenseCheck);

router.post('/license/activate', handleLicenseCheck);
router.get('/license/activate', handleLicenseCheck);

router.post('/api/v1/license/validate', handleLicenseCheck);
router.get('/api/v1/license/validate', handleLicenseCheck);

router.post('/api/v1/license/verify', handleLicenseCheck);
router.get('/api/v1/license/verify', handleLicenseCheck);

router.post('/api/v1/license/activate', handleLicenseCheck);
router.get('/api/v1/license/activate', handleLicenseCheck);

export default router;
