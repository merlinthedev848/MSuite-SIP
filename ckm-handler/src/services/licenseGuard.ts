import http from 'http';
import https from 'https';
import { LICENSE_KEY, SERVER_DOMAIN } from '../config';
import { Request, Response, NextFunction } from 'express';

export interface LicenseState {
  isActive: boolean;
  status: string;
  licensee: string;
  lastCheckedAt: Date | null;
  revocationReason?: string;
  gracePeriodExpiresAt?: Date;
}

export const licenseState: LicenseState = {
  isActive: true, // Default to true on boot with 48-hr grace period
  status: 'Checking...',
  licensee: 'Authorized Client',
  lastCheckedAt: null,
  gracePeriodExpiresAt: new Date(Date.now() + 48 * 3600 * 1000)
};

/**
 * Validates the CKM Handler Docker container license against accounts.chriskendall.media
 */
export async function validateContainerLicense(): Promise<void> {
  const key = (LICENSE_KEY || '').trim();

  // 1. Managed & Local developer bypass
  if (!key || key.startsWith('MANAGED-') || key.startsWith('DEV-') || key.startsWith('LOCAL-')) {
    licenseState.isActive = true;
    licenseState.status = 'Managed Service License (Active)';
    licenseState.licensee = 'Chris Kendall Media Services';
    licenseState.lastCheckedAt = new Date();
    return;
  }

  // 2. Validate buyout / contractor license remotely
  const payload = JSON.stringify({
    license_key: key,
    domain: SERVER_DOMAIN,
    version: '1.4.0',
    service: 'ckm-handler'
  });

  try {
    const isHttps = true;
    const client = https;

    const options = {
      hostname: 'accounts.chriskendall.media',
      port: 443,
      path: '/api/v1/license/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'CKM-Handler/1.4.0'
      },
      timeout: 8000
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 201) {
            const body = JSON.parse(data);
            if (body.valid || body.active || body.status === 'Active' || body.status === 'Licensed') {
              licenseState.isActive = true;
              licenseState.status = 'Licensed (Active)';
              licenseState.licensee = body.licensee?.company || body.buyer || 'Contractor Licensee';
              licenseState.lastCheckedAt = new Date();
              licenseState.gracePeriodExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);
              console.log(`[License Guard] Container license verified: ${licenseState.licensee}`);
              return;
            }
          }

          // Inactive / Revoked response
          licenseState.isActive = false;
          licenseState.status = 'Suspended / Revoked';
          licenseState.revocationReason = 'The contractor license for this CKM Handler has been terminated or expired.';
          licenseState.lastCheckedAt = new Date();
          console.warn(`[License Guard] WARNING: License check rejected by authority: ${licenseState.revocationReason}`);
        } catch {
          handleOfflineGrace();
        }
      });
    });

    req.on('error', (err) => {
      console.warn(`[License Guard] Remote verification network notice: ${err.message}`);
      handleOfflineGrace();
    });

    req.on('timeout', () => {
      req.destroy();
      handleOfflineGrace();
    });

    req.write(payload);
    req.end();
  } catch (err: any) {
    handleOfflineGrace();
  }
}

function handleOfflineGrace() {
  const now = new Date();
  if (licenseState.gracePeriodExpiresAt && now < licenseState.gracePeriodExpiresAt) {
    console.log('[License Guard] Operating in offline grace period until next validation cycle.');
    licenseState.isActive = true;
    licenseState.status = 'Active (Offline Grace Period)';
  } else {
    licenseState.isActive = false;
    licenseState.status = 'Grace Period Expired';
    licenseState.revocationReason = 'Unable to verify contractor license with licensing authority for over 48 hours.';
    console.error('[License Guard] CRITICAL: License grace period expired without authority check-in.');
  }
}

/**
 * Express Middleware: Enforces IP Protection Killswitch
 * Prevents provisioning or signaling if the contractor license is revoked
 */
export function licenseGateMiddleware(req: Request, res: Response, next: NextFunction) {
  // Always permit admin UI and static assets so the contractor can view their account status
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin') || req.path === '/api/health') {
    return next();
  }

  if (!licenseState.isActive) {
    return res.status(403).json({
      ok: false,
      error: 'LICENSE_SUSPENDED',
      message: licenseState.revocationReason || 'This CKM Handler server is currently disabled. Please contact Chris Kendall Media.'
    });
  }

  next();
}

/**
 * Initializes the 24-hour phone-home license guard daemon
 */
export function startLicenseGuardDaemon(): void {
  // Check immediately on boot
  validateContainerLicense();

  // Run periodic heartbeat check every 24 hours
  setInterval(() => {
    validateContainerLicense();
  }, 24 * 3600 * 1000);
}
