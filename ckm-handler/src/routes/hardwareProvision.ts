import { Router, Request, Response } from 'express';
import systemDb from '../database/systemDb';
import { generateYealinkConfig, HandsetAccountConfig } from '../templates/yealink';
import { generateFanvilConfig } from '../templates/fanvil';
import { generateGrandstreamConfig } from '../templates/grandstream';

const router = Router();

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

  // 3. Look up MAC address in physical_handsets table
  const handset = systemDb.prepare(`
    SELECT h.mac_address, h.brand, h.model, h.line_label, h.blf_keys_json,
           e.extension, e.sip_username, e.sip_password, e.display_name, e.is_active
    FROM physical_handsets h
    JOIN extensions e ON h.extension = e.extension
    WHERE LOWER(REPLACE(h.mac_address, ':', '')) = ?
  `).get(cleanMac) as any;

  if (!handset) {
    return res.status(404).send(`# Error: Handset MAC [${cleanMac}] is not registered in CKM Handler.`);
  }

  if (handset.is_active !== 1) {
    return res.status(403).send('# Error: Assigned extension has been deactivated.');
  }

  // Fetch current server config
  const config = systemDb.prepare('SELECT * FROM server_config WHERE id = 1').get() as any;

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
  systemDb.prepare(`
    UPDATE physical_handsets 
    SET last_provisioned_at = CURRENT_TIMESTAMP 
    WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
  `).run(cleanMac);

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

export default router;
