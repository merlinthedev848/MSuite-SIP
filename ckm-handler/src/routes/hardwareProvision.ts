// ==============================================================================
// FreePBX Dynamic Template Variable Substitution Engine
// Injects {$domain}, {$PbxAddress}, and account variables from Global Settings
// ==============================================================================
export function substituteTemplateVariables(raw: string, config: Partial<ServerConfigRow> | null | undefined, accountCfg: Partial<HandsetAccountConfig>): string {
  if (!raw) return '';
  const lines = resolveProfile({
    extension: accountCfg?.extension || '',
    username: accountCfg?.username || accountCfg?.extension || '',
    password: accountCfg?.password || '',
    displayName: accountCfg?.displayName || '',
    sipServer: accountCfg?.sipServer || config?.pbx_server || '',
    sipPort: accountCfg?.sipPort || config?.pbx_port || 5060,
    sipTransport: accountCfg?.sipTransport || config?.pbx_transport || 'UDP',
    dataHandlerUrl: accountCfg?.dataHandlerUrl || config?.data_handler_url || '',
    lineCount: accountCfg?.lineCount,
    lines: accountCfg?.lines
  }).lines;
  const second = lines[1];
  const domain = (config?.data_handler_url || '').trim().replace(/\/$/, '');
  const cleanDomainHost = domain.replace(/^https?:\/\//, '');
  const pbxAddress = (config?.pbx_server || '').trim();
  const pbxPort = String(config?.pbx_port || 5060);
  const pbxTransport = String(config?.pbx_transport || 'UDP');

    const extVal = accountCfg?.extension || '';
  const userVal = accountCfg?.username || extVal;
  const passVal = accountCfg?.password || '';
  const displayVal = accountCfg?.displayName || `Ext ${extVal}`;

  return raw
  return raw
    .replace(/\{\$domain\}/gi, () => domain)
    .replace(/\{\$dataHandlerUrl\}/gi, () => domain)
    .replace(/\{\$serverDomain\}/gi, () => cleanDomainHost)
    .replace(/\{\$PbxAddress\}/gi, () => pbxAddress)
    .replace(/\{\$pbxAddress\}/gi, () => pbxAddress)
    .replace(/\{\$pbx_address\}/gi, () => pbxAddress)
    .replace(/\{\$PBX_SERVER\}/gi, () => pbxAddress)
    .replace(/\{\$sipServer\}/gi, () => pbxAddress)
    .replace(/\{\$sipPort\}/gi, () => String(pbxPort))
    .replace(/\{\$pbxPort\}/gi, () => String(pbxPort))
    .replace(/\{\$sipTransport\}/gi, () => pbxTransport)
    .replace(/\{\$pbxTransport\}/gi, () => pbxTransport)
    .replace(/\{\$extension\}/gi, () => extVal)
    .replace(/\{\$username\}/gi, () => userVal)
    .replace(/\{\$password\}/gi, () => passVal)
    .replace(/\{\$displayName\}/gi, () => displayVal)
    .replace(/\{\$lineLabel\}/gi, () => displayVal)
    .replace(/\{\$lineCount\}/gi, () => String(resolveLineCount(accountCfg)))
    .replace(/\{\$line2Extension\}/gi, () => second?.extension || extVal)
    .replace(/\{\$line2Username\}/gi, () => second?.username || userVal)
    .replace(/\{\$line2Password\}/gi, () => second?.password || passVal)
    .replace(/\{\$line2Label\}/gi, () => second?.label || `${displayVal} L2`);
}

import { Router, Request, Response } from 'express';
import systemDb, { logActivity } from '../database/systemDb';
import { SERVER_DOMAIN } from '../config';
import { directoryTokenForExtension } from './directory';
import { ServerConfigRow, HandsetWithExtensionRow, RouterRow, ExtensionRow } from '../types/models';
import { broadcastDeviceLog } from '../services/telemetryStream';
import { generateYealinkCommonConfig, HandsetAccountConfig } from '../templates/yealink';
import { resolveLineCount, resolveProfile } from '../templates/profile';
import { sanitizeDialPlan, sanitizeTimezone } from '../templates/site';
import { generatePolyCommonConfig } from '../templates/poly';
import { recordDeviceProvisionEvent, takeDiscoveredProvisionLog } from '../services/deviceProvisionLog';
import { generateDefaultHandsetConfig } from '../templates/catalog';
import { generateRouterConfig, RouterConfigParams } from '../templates/routerTemplates';

export function siteDefaultsForPbx(pbxId?: string | null): { timezone: string; dialPlan: string } {
  let row: { timezone?: string | null; dial_plan?: string | null } | undefined;
  if (pbxId) {
    row = systemDb.prepare(
      'SELECT timezone, dial_plan FROM pbx_instances WHERE id = ? AND is_active = 1'
    ).get(pbxId) as { timezone?: string | null; dial_plan?: string | null } | undefined;
  }
  if (!row) {
    row = systemDb.prepare(
      'SELECT timezone, dial_plan FROM pbx_instances WHERE is_active = 1 ORDER BY is_default DESC, name ASC LIMIT 1'
    ).get() as { timezone?: string | null; dial_plan?: string | null } | undefined;
  }
  return {
    timezone: sanitizeTimezone(row?.timezone),
    dialPlan: sanitizeDialPlan(row?.dial_plan)
  };
}

const router = Router();

// Pre-compiled high-speed statements
const getHandsetStmt = systemDb.prepare(`
  SELECT h.mac_address, h.brand, h.model, h.line_label, h.line_count, h.blf_keys_json, h.custom_config,
         e.extension, e.sip_username, e.sip_password, e.display_name, e.is_active, e.pbx_id
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
  INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, provision_log, last_provisioned_at)
  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
    const commonCfg = getServerConfigStmt.get() as ServerConfigRow | undefined;
    const commonUrl = commonCfg?.data_handler_url || `https://${SERVER_DOMAIN}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(generateYealinkCommonConfig(commonUrl));
  }
  if (filename === '000000000000.cfg' || filename === '000000000000-phone.cfg') {
    broadcastDeviceLog('DESKPHONE', 'INFO', `Poly common bootstrap template fetched (${filename})`, { ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });
    const commonCfg = getServerConfigStmt.get() as ServerConfigRow | undefined;
    const commonUrl = commonCfg?.data_handler_url || `https://${SERVER_DOMAIN}`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(generatePolyCommonConfig(commonUrl));
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
        autoAdoptHandsetStmt.run(
          cleanMac.toUpperCase(),
          meta.brand,
          meta.model,
          freeExt.extension,
          freeExt.display_name || `Ext ${freeExt.extension}`,
          takeDiscoveredProvisionLog(cleanMac)
        );
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
      recordDeviceProvisionEvent(cleanMac, {
        level: 'WARN',
        kind: 'error',
        message: `Provision fetch before adoption (${meta.brand} ${meta.model}) from ${req.ip || 'unknown'}. No config served.`
      });
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
    recordDeviceProvisionEvent(cleanMac, {
      level: 'ERROR',
      kind: 'error',
      message: `Config fetch refused: extension ${handset.extension} is deactivated.`
    }, [handset.sip_password]);
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

  let pbxServer = config?.pbx_server || '127.0.0.1';
  let pbxPort = config?.pbx_port || 5060;
  let pbxTransport = config?.pbx_transport || 'UDP';

  const extPbxId = (handset as any).pbx_id;
  if (extPbxId) {
    try {
      const pbxRow = systemDb.prepare('SELECT host, sip_port, sip_transport FROM pbx_instances WHERE id = ? AND is_active = 1').get(extPbxId) as { host: string; sip_port: number; sip_transport: string } | undefined;
      if (pbxRow) {
        pbxServer = pbxRow.host;
        pbxPort = pbxRow.sip_port;
        pbxTransport = pbxRow.sip_transport;
      }
    } catch {}
  }
  const site = siteDefaultsForPbx(extPbxId);
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
    directoryToken: directoryTokenForExtension(handset.extension),
    blfKeys,
    timezone: site.timezone,
    dialPlan: site.dialPlan
  };
  if (handset.line_count != null && Number.isInteger(Number(handset.line_count))) {
    accountCfg.lineCount = Number(handset.line_count);
  }

  const ua = String(req.headers['user-agent'] || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  const from = req.ip || 'unknown';

  // 4. If user has customized their provisioning profile directly (FreePBX style), serve it with dynamic variable substitution!
  if (handset.custom_config && handset.custom_config.trim().length > 0) {
    const substituted = substituteTemplateVariables(handset.custom_config, config, accountCfg);
    recordDeviceProvisionEvent(cleanMac, {
      level: 'SUCCESS',
      kind: 'fetch',
      message: `Custom profile fetched for Ext ${handset.extension} from ${from}${ua ? ` (${ua})` : ''}. Line count is whatever that saved file sets.`
    }, [handset.sip_password]);
    const isXml = substituted.trim().startsWith('<') || filename.endsWith('.xml');
    res.setHeader('Content-Type', `${isXml ? 'application/xml' : 'text/plain'}; charset=utf-8`);
    return res.send(substituted);
  }

  // 5. Otherwise generate standard manufacturer template and resolve variables
  const brand = (handset.brand || '').toLowerCase();
  let rawContent = '';
  try {
    rawContent = generateDefaultHandsetConfig(brand, accountCfg, handset.model);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'Config generation failed';
    recordDeviceProvisionEvent(cleanMac, {
      level: 'ERROR',
      kind: 'error',
      message: `Config generation failed for Ext ${handset.extension} (${brand} ${handset.model || ''}): ${reason}`
    }, [handset.sip_password]);
    return res.status(500).send('# Error: Provisioning profile could not be generated.');
  }
  const content = substituteTemplateVariables(rawContent, config, accountCfg);
  recordDeviceProvisionEvent(cleanMac, {
    level: 'SUCCESS',
    kind: 'provision',
    message: `Template served for Ext ${handset.extension} (${brand || 'yealink'} ${handset.model || ''}), line_count=${resolveLineCount(accountCfg)}, from ${from}${ua ? ` (${ua})` : ''}.`
  }, [handset.sip_password]);
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

