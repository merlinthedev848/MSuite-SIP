import { Router, Request, Response } from 'express';
import vaultDb from '../database/vaultDb';
import systemDb from '../database/systemDb';

const router = Router();

// Helper to get unified contact entries
function getUnifiedContacts() {
  // Pull from vaultDb contacts first, then fallback to systemDb extensions
  const vaultContacts = vaultDb.prepare('SELECT extension, full_name, mobile, email, department FROM contacts').all() as any[];
  const extensions = systemDb.prepare('SELECT extension, display_name FROM extensions WHERE is_active = 1').all() as any[];

  const map = new Map<string, { extension: string; name: string; email?: string; mobile?: string }>();
  
  for (const ext of extensions) {
    map.set(ext.extension, { extension: ext.extension, name: ext.display_name });
  }

  for (const vc of vaultContacts) {
    map.set(vc.extension, {
      extension: vc.extension,
      name: vc.full_name || map.get(vc.extension)?.name || vc.extension,
      email: vc.email,
      mobile: vc.mobile
    });
  }

  return Array.from(map.values()).sort((a, b) => a.extension.localeCompare(b.extension));
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
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<YealinkIPPhoneDirectory>\r\n  <Title>Company Directory</Title>\r\n`;

  for (const c of contacts) {
    xml += `  <DirectoryEntry>\r\n`;
    xml += `    <Name>${c.name}</Name>\r\n`;
    xml += `    <Telephone>${c.extension}</Telephone>\r\n`;
    if (c.mobile) {
      xml += `    <Telephone>${c.mobile}</Telephone>\r\n`;
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
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<PhoneBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <Name>${c.name}</Name>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${c.extension}</phonenumber>\r\n`;
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
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<AddressBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <FirstName>${c.name}</FirstName>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${c.extension}</phonenumber>\r\n`;
    xml += `    </Phone>\r\n`;
    xml += `  </Contact>\r\n`;
  }

  xml += `</AddressBook>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

export default router;
