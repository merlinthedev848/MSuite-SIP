import { Router, Request, Response } from 'express';
import systemDb from '../database/systemDb';
import { generateYealinkConfig, HandsetAccountConfig } from '../templates/yealink';
import { generateFanvilConfig } from '../templates/fanvil';
import { generateGrandstreamConfig } from '../templates/grandstream';
import { generateRouterConfig, RouterConfigParams } from '../templates/routerTemplates';

const router = Router();

// Pre-compiled high-speed statements
const getHandsetStmt = systemDb.prepare(`
  SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json,
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
  SELECT * FROM routers WHERE LOWER(REPLACE(mac_address, ":", "")) = ?
`);

// Hardware Deskphone Provisioning Handler
router.get('/provision/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename.toLowerCase();

  // 1. Check for common model configs (e.g. y000000000000.cfg)
  if (filename.startsWith('y0000000000') && filename.endsWith('.cfg')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`#!version:1.0.0.1\r\n# Common Yealink Configuration Template\r\n`);
  }

  // 2. Extract MAC address from filename
  // Examples: "001565a1b2c3.cfg", "cfg000b82a1b2c3.xml", "00a0bca1b2c3.txt", "00a0bca1b2c3.xml"
  let cleanMac = filename
    .replace(/^cfg/, '')
    .replace(/\.(cfg|xml|txt|ini|boot)$/i, '')
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

  // Fetch current server config
  const config = getServerConfigStmt.get() as any;

  // Parse optional BLF keys
  let blfKeys: Array<{ key: number; extension: string; label: string }> = [];
  if (handset.blf_keys_json) {
    try {
      blfKeys = JSON.parse(handset.blf_keys_json);
    } catch {
      // ignore parse error
    }
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

  // Update last provisioned timestamp
  updateHandsetProvisionedStmt.run(cleanMac);

  // 4. Render manufacturer-specific configuration
  const brand = (handset.brand || '').toLowerCase();
  if (brand === 'fanvil' || filename.endsWith('.xml') && brand.includes('fanvil')) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(generateFanvilConfig(accountCfg));
  } else if (brand === 'grandstream' || filename.startsWith('cfg') || (filename.endsWith('.xml') && brand.includes('grandstream'))) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.send(generateGrandstreamConfig(accountCfg));
  } else {
    // Default to Yealink CFG
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(generateYealinkConfig(accountCfg));
  }
});

// Router & VoIP Gateway Automated Fetch
// Example: GET /provision/router/1.rsc or GET /provision/router/001565112233.sh
router.get('/provision/router/:identifier', (req: Request, res: Response) => {
  const raw = req.params.identifier.toLowerCase();
  const cleanId = raw.replace(/\.(rsc|sh|cfg|txt|xml)$/i, '');

  let routerRec = null;
  if (/^\d+$/.test(cleanId)) {
    routerRec = getRouterByIdStmt.get(parseInt(cleanId, 10)) as any;
  } else {
    routerRec = getRouterByMacStmt.get(cleanId) as any;
  }

  if (!routerRec) {
    return res.status(404).send('# Error: Router configuration profile not found.');
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
