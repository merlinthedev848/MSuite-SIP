import { Router, Request, Response } from 'express';
import systemDb from '../database/systemDb';
import { broadcastDeviceLog } from '../services/telemetryStream';
import { ServerConfigRow } from '../types/models';

const router = Router();

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<(?:\w+:)?${tag}[^>]*>([^<]*)<\/(?:\w+:)?${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

// 1. CWMP / TR-069 CPE Inform Endpoint
// Handles CPE Informs from network routers, ATAs, and IP phones (GenieACS / Omada compatible)
router.post(['/cwmp', '/tr069', '/acs'], (req: Request, res: Response) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || '');

  // Extract CWMP SOAP parameters
  const manufacturer = extractTag(rawBody, 'Manufacturer') || 'Generic-CPE';
  const oui = extractTag(rawBody, 'OUI') || '';
  const productClass = extractTag(rawBody, 'ProductClass') || extractTag(rawBody, 'ModelName') || 'VoIP-Gateway';
  const serialNumber = extractTag(rawBody, 'SerialNumber') || 'SN-' + Date.now().toString(36).toUpperCase();
  const softwareVersion = extractTag(rawBody, 'SoftwareVersion') || '';
  const eventCode = extractTag(rawBody, 'EventCode') || '0 BOOTSTRAP';

  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const cleanId = (serialNumber || productClass).toUpperCase();

  // Emits structured telemetry event to live event bus
  broadcastDeviceLog('ROUTER', 'INFO', `[GenieACS/TR-069 Inform] CPE (${manufacturer.toUpperCase()} ${productClass}) event [${eventCode}] from ${clientIp} (SN: ${serialNumber})`, {
    deviceIdentifier: cleanId,
    ipAddress: clientIp,
    userAgent: (req.headers['user-agent'] as string) || 'CWMP-CPE',
    metadata: {
      manufacturer,
      productClass,
      serialNumber,
      oui,
      softwareVersion,
      eventCode
    }
  });

  // Record unadopted device in discovered_devices if not registered as router
  const existingRouter = systemDb.prepare('SELECT id FROM routers WHERE UPPER(site_name) = ? OR UPPER(mac_address) = ?').get(cleanId, cleanId);
  if (!existingRouter) {
    try {
      systemDb.prepare(`
        INSERT INTO discovered_devices (mac_address, brand, model, ip_address, user_agent, status, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING_ADOPTION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(mac_address) DO UPDATE SET
          brand = excluded.brand,
          model = excluded.model,
          ip_address = excluded.ip_address,
          user_agent = excluded.user_agent,
          last_seen_at = CURRENT_TIMESTAMP
      `).run(
        cleanId,
        manufacturer.toLowerCase(),
        productClass,
        clientIp,
        `CWMP/1.0 (${manufacturer} ${productClass} ${softwareVersion})`
      );
    } catch {}
  }

  // Construct standard SOAP CWMP InformResponse envelope
  const cwmpResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <soapenv:Header>
    <cwmp:ID soapenv:mustUnderstand="1">1</cwmp:ID>
  </soapenv:Header>
  <soapenv:Body>
    <cwmp:InformResponse>
      <MaxEnvelopes>1</MaxEnvelopes>
    </cwmp:InformResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('SOAPServer', 'CKM-GenieACS-Engine/1.4.0');
  return res.status(200).send(cwmpResponse);
});

// GET probe / connection check for CPE ping
router.get(['/cwmp', '/tr069', '/acs'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send('CKM-GenieACS CWMP TR-069 Auto-Configuration Server is operational. Ready for CPE Inform handshakes.\n');
});

export default router;
