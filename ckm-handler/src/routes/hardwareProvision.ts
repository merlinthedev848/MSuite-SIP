import { Router, Request, Response } from 'express';
import systemDb, { logActivity } from '../database/systemDb';
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
  SET last_provisioned_at = CURRENT_TIMESTAMP 
  WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
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

// Hardware Deskphone Provisioning Handler
router.get('/provision/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename.toLowerCase();

  // 1. Check for vendor generic/common model bootstrap configs
  if (filename.startsWith('y0000000000') && filename.endsWith('.cfg')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`#!version:1.0.0.1\r\n# Common Yealink Configuration Template\r\n`);
  }
  if (filename === '000000000000.cfg' || filename === '000000000000-phone.cfg') {
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
    return res.status(404).send('# Error: Invalid MAC address length.');
  }

  // 3. Look up MAC address using pre-compiled statement
  const handset = getHandsetStmt.get(cleanMac) as any;

  if (!handset) {
    return res.status(404).send(`# Error: Handset MAC [${cleanMac}] is not registered in CKM Handler.`);
  }

  if (handset.is_active !== 1) {
    return res.status(403).send('# Error: Assigned extension has been deactivated.');
  }

  // Update last provisioned timestamp
  updateHandsetProvisionedStmt.run(cleanMac);
  logActivity('HANDSET_PROVISIONED', `Handset [${cleanMac.toUpperCase()}] (${(handset.brand || 'deskphone').toUpperCase()} ${handset.model || ''}) fetched config for Ext ${handset.extension}`, req.ip);

  // 4. If user has customized their provisioning profile directly, serve it!
  if (handset.custom_config && handset.custom_config.trim().length > 0) {
    const isXml = handset.custom_config.trim().startsWith('<');
    res.setHeader('Content-Type', `${isXml ? 'application/xml' : 'text/plain'}; charset=utf-8`);
    return res.send(handset.custom_config);
  }

  // 5. Otherwise generate standard manufacturer template
  const config = getServerConfigStmt.get() as any;

  let blfKeys: Array<{ key: number; extension: string; label: string }> = [];
  if (handset.blf_keys_json) {
    try {
      blfKeys = JSON.parse(handset.blf_keys_json);
    } catch {}
  }

  const accountCfg: HandsetAccountConfig = {
    extension: handset.extension,
    username: handset.sip_username,
    password: handset.sip_password,
    displayName: handset.line_label || handset.display_name,
    sipServer: config.pbx_server,
    sipPort: config.pbx_port,
    sipTransport: config.pbx_transport,
    dataHandlerUrl: config.data_handler_url,
    blfKeys
  };

  const brand = (handset.brand || '').toLowerCase();
  const content = generateDefaultHandsetConfig(brand, accountCfg);
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
    routerRec = getRouterByIdStmt.get(parseInt(cleanId, 10)) as any;
  } else {
    routerRec = getRouterByMacStmt.get(cleanId) as any;
  }

  if (!routerRec) {
    return res.status(404).send('# Error: Router configuration profile not found.');
  }

  // If user has customized the script in the UI, serve the customized script!
  if (routerRec.custom_script && routerRec.custom_script.trim().length > 0) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(routerRec.custom_script);
  }

  const config = getServerConfigStmt.get() as any;

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
  res.setHeader('Content-Type', `${generated.mimeType}; charset=utf-8`);
  return res.send(generated.content);
});

export default router;
