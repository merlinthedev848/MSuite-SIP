import { Router, Request, Response } from 'express';
import { broadcastDeviceLog } from '../services/telemetryStream';

const router = Router();

// XML Special Characters Escaping for Hardware Deskphones
function escapeXml(unsafe: string): string {
  return String(unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Helper to get unified contact entries
// GDPR / Multi-Tenant Isolation: Never expose system-wide PBX extensions across tenants.
function getUnifiedContacts(): Array<{ extension: string; name: string; email?: string; mobile?: string }> {
  return [];
}

// 1. JSON Endpoint for MerlinSIP Softphones
router.get('/api/v1/contacts', (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  return res.json({
    ok: true,
    count: contacts.length,
    contacts: contacts.map(c => ({
      id: c.extension,
      name: c.name,
      extension: c.extension,
      phone: c.mobile || c.extension,
      email: c.email || ''
    }))
  });
});

// 2. Yealink XML Phonebook
router.get('/phonebook/yealink.xml', (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  broadcastDeviceLog('DESKPHONE', 'INFO', `Yealink corporate phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<YealinkIPPhoneDirectory>\r\n  <Title>Company Directory</Title>\r\n`;

  for (const c of contacts) {
    xml += `  <DirectoryEntry>\r\n`;
    xml += `    <Name>${escapeXml(c.name)}</Name>\r\n`;
    xml += `    <Telephone>${escapeXml(c.extension)}</Telephone>\r\n`;
    if (c.mobile) {
      xml += `    <Telephone>${escapeXml(c.mobile)}</Telephone>\r\n`;
    }
    xml += `  </DirectoryEntry>\r\n`;
  }

  xml += `</YealinkIPPhoneDirectory>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// 3. Fanvil XML Phonebook
router.get('/phonebook/fanvil.xml', (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  broadcastDeviceLog('DESKPHONE', 'INFO', `Fanvil corporate phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<PhoneBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <Name>${escapeXml(c.name)}</Name>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${escapeXml(c.extension)}</phonenumber>\r\n`;
    xml += `      <accountindex>1</accountindex>\r\n`;
    xml += `    </Phone>\r\n`;
    xml += `  </Contact>\r\n`;
  }

  xml += `</PhoneBook>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// 4. Grandstream XML Phonebook
router.get('/phonebook/grandstream.xml', (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  broadcastDeviceLog('DESKPHONE', 'INFO', `Grandstream corporate phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<AddressBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <FirstName>${escapeXml(c.name)}</FirstName>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${escapeXml(c.extension)}</phonenumber>\r\n`;
    xml += `    </Phone>\r\n`;
    xml += `  </Contact>\r\n`;
  }

  xml += `</AddressBook>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// 5. Snom XML Phonebook
router.get('/phonebook/snom.xml', (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  broadcastDeviceLog('DESKPHONE', 'INFO', `Snom corporate phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<SnomIPPhoneDirectory>\r\n  <Title>Company Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of contacts) {
    xml += '  <DirectoryEntry>\r\n';
    xml += '    <Name>' + escapeXml(c.name) + '</Name>\r\n';
    xml += '    <Telephone>' + escapeXml(c.extension) + '</Telephone>\r\n';
    if (c.mobile) {
      xml += '    <Telephone>' + escapeXml(c.mobile) + '</Telephone>\r\n';
    }
    xml += '  </DirectoryEntry>\r\n';
  }

  xml += '</SnomIPPhoneDirectory>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// 6. Cisco / SPA XML Phonebook
router.get(['/phonebook/cisco.xml', '/phonebook/spa.xml'], (req: Request, res: Response) => {
  const contacts = getUnifiedContacts();
  broadcastDeviceLog('DESKPHONE', 'INFO', `Cisco/SPA corporate phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<CiscoIPPhoneDirectory>\r\n  <Title>Company Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of contacts) {
    xml += '  <DirectoryEntry>\r\n';
    xml += '    <Name>' + escapeXml(c.name) + '</Name>\r\n';
    xml += '    <Telephone>' + escapeXml(c.extension) + '</Telephone>\r\n';
    xml += '  </DirectoryEntry>\r\n';
  }

  xml += '</CiscoIPPhoneDirectory>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

export default router;
