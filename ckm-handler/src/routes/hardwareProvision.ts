// ==============================================================================
// FreePBX Dynamic Template Variable Substitution Engine
// Injects {$domain}, {$PbxAddress}, and account variables from Global Settings
// ==============================================================================
export function substituteTemplateVariables(raw: string, config: Partial<ServerConfigRow> | null | undefined, accountCfg: Partial<HandsetAccountConfig>): string {
  if (!raw) return '';
  const domain = (config?.data_handler_url || '').trim().replace(/\/$/, '');
  const cleanDomainHost = domain.replace(/^https?:\/\//, '');
  const pbxAddress = (config?.pbx_server || '').trim();
  const pbxPort = String(config?.pbx_port || 5060);
  const pbxTransport = String(config?.pbx_transport || 'UDP');

  return raw
    .replace(/\{\$domain\}/gi, domain)
    .replace(/\{\$dataHandlerUrl\}/gi, domain)
    .replace(/\{\$serverDomain\}/gi, cleanDomainHost)
    .replace(/\{\$PbxAddress\}/gi, pbxAddress)
    .replace(/\{\$pbxAddress\}/gi, pbxAddress)
    .replace(/\{\$pbx_address\}/gi, pbxAddress)
    .replace(/\{\$PBX_SERVER\}/gi, pbxAddress)
    .replace(/\{\$sipServer\}/gi, pbxAddress)
    .replace(/\{\$sipPort\}/gi, pbxPort)
    .replace(/\{\$pbxPort\}/gi, pbxPort)
    .replace(/\{\$sipTransport\}/gi, pbxTransport)
    .replace(/\{\$pbxTransport\}/gi, pbxTransport)
    .replace(/\{\$extension\}/gi, accountCfg?.extension || '')
    .replace(/\{\$username\}/gi, accountCfg?.username || accountCfg?.extension || '')
    .replace(/\{\$password\}/gi, accountCfg?.password || '')
    .replace(/\{\$displayName\}/gi, accountCfg?.displayName || `Ext ${accountCfg?.extension || ''}`)
    .replace(/\{\$lineLabel\}/gi, accountCfg?.displayName || `Ext ${accountCfg?.extension || ''}`);
}

import { Router, Request, Response } from 'express';
import systemDb, { logActivity } from '../database/systemDb';
import { SERVER_DOMAIN } from '../config';
import { ServerConfigRow, HandsetWithExtensionRow, RouterRow, ExtensionRow } from '../types/models';
import { broadcastDeviceLog } from '../services/telemetryStream';
import { generateYealinkConfig, HandsetAccountConfig } from '../templates/yealink';
import { generateFanvilConfig } from '../templates/fanvil';
import { generateGrandstreamConfig } from '../templates/grandstream';
import { generatePolyConfig } from '../templates/poly';
import { generateCiscoPhoneConfig } from '../templates/ciscoPhone';
import { generateSnomConfig } from '../templates/snom';
import { generateGigasetConfig } from '../templates/gigaset';
import { generateDefaultHandsetConfig } from '../templates/catalog';
import { generateRouterConfig, RouterConfigParams } from '../templates/routerTemplates';

const router = Router();

// Pre-compiled high-speed statements
const getHandsetStmt = systemDb.prepare(`
  SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json, h.custom_config,
         e.extension, e.sip_username, e.sip_password, e.display_name, e.is_active
  FROM physical_handsets h
  JOIN extensions e ON h.extension = e.extension
  WHERE LOWER(REPLACE(h.mac_address, ':', '')) = ?
`);

const updateHandsetProvisionedStmt = systemDb.prepare(`
  UPDATE physical_handsets 
  SET last_provisioned_at = CURRENT_TIMESTAMP,
      ip_address = ?,
      user_agent = ?
  WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
`);

const updateRouterFetchedStmt = systemDb.prepare(`
  UPDATE routers 
  SET last_fetched_at = CURRENT_TIMESTAMP,
      last_ip = ?
  WHERE id = ?
`);

const getServerConfigStmt = systemDb.prepare(`
  SELECT * FROM server_config WHERE id = 1
`);

const getRouterByIdStmt = systemDb.prepare(`
  SELECT * FROM routers WHERE id = ?
`);

const getRouterByMacStmt = systemDb.prepare(`
  SELECT * FROM routers WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
`);

// Omada / GenieACS Zero-Touch Discovery Statements
const recordDiscoveredDeviceStmt = systemDb.prepare(`
  INSERT INTO discovered_devices (mac_address, brand, model, ip_address, user_agent, status, last_seen_at)
  VALUES (?, ?, ?, ?, ?, 'PENDING_ADOPTION', CURRENT_TIMESTAMP)
  ON CONFLICT(mac_address) DO UPDATE SET
    ip_address = excluded.ip_address,
    user_agent = excluded.user_agent,
    status = CASE WHEN discovered_devices.status = 'ADOPTED' THEN 'ADOPTED' ELSE 'PENDING_ADOPTION' END,
    last_seen_at = CURRENT_TIMESTAMP
`);

const findAvailableExtensionStmt = systemDb.prepare(`
  SELECT e.extension, e.sip_username, e.sip_password, e.display_name, e.is_active
  FROM extensions e
  LEFT JOIN physical_handsets h ON e.extension = h.extension
  WHERE h.mac_address IS NULL AND e.is_active = 1
  ORDER BY CAST(e.extension AS INTEGER) ASC, e.extension ASC
  LIMIT 1
`);

const autoAdoptHandsetStmt = systemDb.prepare(`
  INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, last_provisioned_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const markDeviceAdoptedStmt = systemDb.prepare(`
  UPDATE discovered_devices SET status = 'ADOPTED', last_seen_at = CURRENT_TIMESTAMP WHERE mac_address = ?
`);

function detectDeviceMetadata(cleanMac: string, filename: string, userAgent: string): { brand: string; model: string } {
  const ua = (userAgent || '').toLowerCase();
  const mac = cleanMac.toLowerCase();
  let brand = 'yealink';
  let model = 'T46U';

  if (ua.includes('yealink') || mac.startsWith('001565') || filename.startsWith('y00000000')) {
    brand = 'yealink';
    const m = ua.match(/t\d{2,3}[ugw]?(?:-pro)?/i);
    if (m) model = m[0].toUpperCase();
  } else if (ua.includes('grandstream') || mac.startsWith('000b82') || filename.startsWith('cfg')) {
    brand = 'grandstream';
    const m = ua.match(/gxp\d{4}|grp\d{4}/i);
    if (m) model = m[0].toUpperCase();
  } else if (ua.includes('snom') || mac.startsWith('000413') || filename.startsWith('snom')) {
    brand = 'snom';
    const m = ua.match(/d\d{3}|m\d{2}/i);
    if (m) model = m[0].toUpperCase();
  } else if (ua.includes('poly') || mac.startsWith('0004f2') || filename.includes('-phone.cfg')) {
    brand = 'poly';
    const m = ua.match(/vvx\s*\d{3}/i);
    if (m) model = m[0].replace(/\s+/, '').toUpperCase();
  } else if (ua.includes('cisco') || ua.includes('linksys') || mac.startsWith('00085d') || filename.startsWith('spa')) {
    brand = 'cisco';
    const m = ua.match(/spa\d{3}|cp-\d{4}/i);
    if (m) model = m[0].toUpperCase();
  } else if (ua.includes('fanvil') || mac.startsWith('00a859')) {
    brand = 'fanvil';
    const m = ua.match(/x\d{1,2}[uv]?/i);
    if (m) model = m[0].toUpperCase();
  } else if (ua.includes('gigaset') || mac.startsWith('002104')) {
    brand = 'gigaset';
  }

  return { brand, model };
}

// Hardware Deskphone Provisioning Handler
router.get('/provision/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename.toLowerCase();

  // 1. Check for vendor generic/common model bootstrap configs
  if (filename.startsWith('y0000000000') && filename.endsWith('.cfg')) {
    broadcastDeviceLog('DESKPHONE', 'INFO', `Yealink common bootstrap configuration fetched (${filename})`, { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`#!version:1.0.0.1\r\n# Common Yealink Configuration Template\r\n`);
  }
  if (filename === '000000000000.cfg' || filename === '000000000000-phone.cfg') {
    broadcastDeviceLog('DESKPHONE', 'INFO', `Poly common bootstrap template fetched (${filename})`, { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(`<?xml version="1.0" standalone="yes"?><PHONE_CONFIG><ALL/></PHONE_CONFIG>`);
  }

  // 2. Extract MAC address from filename
  // Examples: "001565a1b2c3.cfg", "cfg000b82a1b2c3.xml", "spa001565a1b2c3.cfg", "snom000413112233.xml", "0004f2112233-phone.cfg"
  let cleanMac = filename
    .replace(/^(cfg|spa|snom|cp-)/i, '')
    .replace(/-phone/i, '')
    .replace(/\.(cfg|xml|txt|ini|boot|htm)$/i, '')
    .replace(/[^0-9a-f]/gi, '');

  if (cleanMac.length !== 12) {
    broadcastDeviceLog('SECURITY', 'WARN', `Invalid MAC address length request: [${filename}] from IP ${req.ip}`, { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });
    return res.status(404).send('# Error: Invalid MAC address length.');
  }

  // 3. Look up MAC address using pre-compiled statement
  let handset = getHandsetStmt.get(cleanMac) as HandsetWithExtensionRow | undefined;

  if (!handset) {
    const meta = detectDeviceMetadata(cleanMac, filename, req.headers['user-agent'] as string);
    const serverCfg = getServerConfigStmt.get() as ServerConfigRow | undefined;

    // Check if Zero-Touch Auto-Adoption is enabled (Omada / GenieACS style)
    if (serverCfg?.auto_adopt_enabled === 1) {
      const freeExt = findAvailableExtensionStmt.get() as ExtensionRow | undefined;
      if (freeExt) {
        autoAdoptHandsetStmt.run(cleanMac.toUpperCase(), meta.brand, meta.model, freeExt.extension, freeExt.display_name || `Ext ${freeExt.extension}`);
        markDeviceAdoptedStmt.run(cleanMac.toUpperCase());
        logActivity('DEVICE_AUTO_ADOPTED', `Handset [${cleanMac.toUpperCase()}] (${meta.brand.toUpperCase()} ${meta.model}) auto-adopted to Ext ${freeExt.extension}`, req.ip);
        broadcastDeviceLog('DESKPHONE', 'SUCCESS', `[Zero-Touch Auto-Adopted] Handset [${cleanMac.toUpperCase()}] (${meta.brand.toUpperCase()} ${meta.model}) bound to Ext ${freeExt.extension}`, {
          deviceIdentifier: cleanMac.toUpperCase(),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string,
          metadata: { extension: freeExt.extension, brand: meta.brand, model: meta.model }
        });
        handset = getHandsetStmt.get(cleanMac) as HandsetWithExtensionRow | undefined;
      }
    }

    if (!handset) {
      // Record unadopted device in discovery queue (Omada pending adoption state)
      recordDiscoveredDeviceStmt.run(cleanMac.toUpperCase(), meta.brand, meta.model, req.ip, (req.headers['user-agent'] as string) || 'Unknown');
      broadcastDeviceLog('DESKPHONE', 'WARN', `[Omada Auto-Discovery] Unadopted deskphone detected: ${meta.brand.toUpperCase()} ${meta.model} [${cleanMac.toUpperCase()}] from ${req.ip} (Pending Adoption)`, {
        deviceIdentifier: cleanMac.toUpperCase(),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string,
        metadata: { brand: meta.brand, model: meta.model, status: 'PENDING_ADOPTION' }
      });
      return res.status(404).send(`# CKM Handler Omada Discovery: Handset [${cleanMac.toUpperCase()}] detected and placed in pending adoption queue.\r\n`);
    }
  }

  if (handset.is_active !== 1) {
    broadcastDeviceLog('DESKPHONE', 'WARN', `Deskphone MAC [${cleanMac.toUpperCase()}] blocked: Extension ${handset.extension} is deactivated`, { deviceIdentifier: cleanMac.toUpperCase(), ipAddress: req.ip });
    return res.status(403).send('# Error: Assigned extension has been deactivated.');
  }

  // Update last provisioned timestamp and connection metadata
  updateHandsetProvisionedStmt.run(req.ip, (req.headers['user-agent'] as string) || '', cleanMac);
  logActivity('HANDSET_PROVISIONED', `Handset [${cleanMac.toUpperCase()}] (${(handset.brand || 'deskphone').toUpperCase()} ${handset.model || ''}) fetched config for Ext ${handset.extension}`, req.ip);
  broadcastDeviceLog('DESKPHONE', 'SUCCESS', `Deskphone [${cleanMac.toUpperCase()}] (${(handset.brand || 'deskphone').toUpperCase()} ${handset.model || ''}) fetched configuration for Ext ${handset.extension}`, {
    deviceIdentifier: cleanMac.toUpperCase(),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    metadata: { extension: handset.extension, brand: handset.brand, model: handset.model, customized: !!(handset.custom_config && handset.custom_config.trim()) }
  });

  const config = getServerConfigStmt.get() as ServerConfigRow | undefined;

  let blfKeys: Array<{ key: number; extension: string; label: string }> = [];
  if (handset.blf_keys_json) {
    try {
      blfKeys = JSON.parse(handset.blf_keys_json);
    } catch {}
  }

  const pbxServer = config?.pbx_server || '127.0.0.1';
  const pbxPort = config?.pbx_port || 5060;
  const pbxTransport = config?.pbx_transport || 'UDP';
  const dataHandlerUrl = config?.data_handler_url || 'https://handler.chriskendall.media';

  const accountCfg: HandsetAccountConfig = {
    extension: handset.extension,
    username: handset.sip_username,
    password: handset.sip_password,
    displayName: handset.line_label || handset.display_name,
    sipServer: pbxServer,
    sipPort: pbxPort,
    sipTransport: pbxTransport,
    dataHandlerUrl: dataHandlerUrl,
    blfKeys
  };

  // 4. If user has customized their provisioning profile directly (FreePBX style), serve it with dynamic variable substitution!
  if (handset.custom_config && handset.custom_config.trim().length > 0) {
    const substituted = substituteTemplateVariables(handset.custom_config, config, accountCfg);
    const isXml = substituted.trim().startsWith('<') || filename.endsWith('.xml');
    res.setHeader('Content-Type', `${isXml ? 'application/xml' : 'text/plain'}; charset=utf-8`);
    return res.send(substituted);
  }

  // 5. Otherwise generate standard manufacturer template and resolve variables
  const brand = (handset.brand || '').toLowerCase();
  const rawContent = generateDefaultHandsetConfig(brand, accountCfg, handset.model);
  const content = substituteTemplateVariables(rawContent, config, accountCfg);
  const isXml = content.trim().startsWith('<') || filename.endsWith('.xml');

  res.setHeader('Content-Type', `${isXml ? 'application/xml' : 'text/plain'}; charset=utf-8`);
  return res.send(content);
});

// Router & VoIP Gateway Automated Fetch
// Example: GET /provision/router/1.rsc or GET /provision/router/001565112233.sh
router.get('/provision/router/:identifier', (req: Request, res: Response) => {
  const raw = req.params.identifier.toLowerCase();
  const cleanId = raw.replace(/\.(rsc|sh|cfg|txt|xml|conf)$/i, '');

  let routerRec = null;
  if (/^\d+$/.test(cleanId)) {
    routerRec = getRouterByIdStmt.get(parseInt(cleanId, 10)) as RouterRow | undefined;
  } else {
    routerRec = getRouterByMacStmt.get(cleanId) as RouterRow | undefined;
  }

  if (!routerRec) {
    return res.status(404).send('# Error: Router configuration profile not found.');
  }

  updateRouterFetchedStmt.run(req.ip, routerRec.id);

  broadcastDeviceLog('ROUTER', 'INFO', `Router #${routerRec.id} (${routerRec.site_name} / ${routerRec.brand.toUpperCase()}) fetched bootstrap configuration`, {
    deviceIdentifier: routerRec.site_name,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string,
    metadata: { siteName: routerRec.site_name, brand: routerRec.brand, customized: !!(routerRec.custom_script && routerRec.custom_script.trim()) }
  });

  // If user has customized the script in the UI, serve the customized script!
  if (routerRec.custom_script && routerRec.custom_script.trim().length > 0) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(routerRec.custom_script);
  }

  const config = getServerConfigStmt.get() as ServerConfigRow | undefined;

  const params: RouterConfigParams = {
    siteName: routerRec.site_name,
    brand: routerRec.brand,
    model: routerRec.model || undefined,
    macAddress: routerRec.mac_address || undefined,
    lanSubnet: routerRec.lan_subnet || undefined,
    voiceVlanId: routerRec.voice_vlan_id || 20,
    voiceSubnet: routerRec.voice_subnet || '10.20.0.1/24',
    pbxServer: config?.pbx_server || '127.0.0.1',
    dataHandlerUrl: config?.data_handler_url || 'https://handler.chriskendall.media',
    disableSipAlg: routerRec.disable_sip_alg === 1,
    enableQos: routerRec.enable_qos === 1
  };

  const generated = generateRouterConfig(params);
  res.setHeader('Content-Type', `${generated.mimeType}; charset=utf-8`);
  return res.send(generated.content);
});

export default router;
