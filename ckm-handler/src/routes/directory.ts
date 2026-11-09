import { Router, Request, Response } from 'express';
import systemDb from '../database/systemDb';
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

export interface ScopedDirectoryContact {
  id: string;
  name: string;
  number: string;
  extension: string;
  mobile: string;
  email: string;
  company: string;
  department: string;
  notes: string;
  addressBookId: number;
  addressBookName: string;
}

interface AddressBookRow {
  id: number;
  name: string;
  description: string;
  include_assigned_extensions: number;
}

interface AddressBookContactRow {
  id: number;
  address_book_id: number;
  name: string;
  number: string;
  extension: string;
  mobile: string;
  email: string;
  company: string;
  department: string;
  notes: string;
}

/**
 * GDPR-Isolated Scoped Contact Resolver:
 * Only returns contacts from Global Shared Address Books explicitly attached to the requesting
 * extension (or specified book_id). Never exposes unassigned or platform-wide PBX extensions.
 */
function getScopedContactsForRequest(req: Request): ScopedDirectoryContact[] {
  const rawExt = String(
    req.query.extension ||
    req.query.ext ||
    req.headers['x-merlinsip-extension'] ||
    ''
  ).trim();

  const rawBookId = String(req.query.book_id || req.query.bookId || '').trim();
  const rawMac = String(req.query.mac || '').replace(/[^0-9a-f]/gi, '').toLowerCase();

  let effectiveExt = rawExt;
  if (!effectiveExt && rawMac.length === 12) {
    try {
      const handset = systemDb.prepare(`
        SELECT extension FROM physical_handsets
        WHERE LOWER(REPLACE(mac_address, ':', '')) = ?
      `).get(rawMac) as { extension: string } | undefined;
      if (handset?.extension) {
        effectiveExt = handset.extension;
      }
    } catch {}
  }

  let books: AddressBookRow[] = [];
  try {
    if (rawBookId && /^\d+$/.test(rawBookId)) {
      const book = systemDb.prepare(`
        SELECT id, name, description, include_assigned_extensions
        FROM shared_address_books
        WHERE id = ?
      `).get(parseInt(rawBookId, 10)) as AddressBookRow | undefined;
      if (book) books = [book];
    } else if (effectiveExt) {
      books = systemDb.prepare(`
        SELECT b.id, b.name, b.description, b.include_assigned_extensions
        FROM shared_address_books b
        JOIN address_book_extensions abe ON b.id = abe.address_book_id
        WHERE abe.extension = ?
        ORDER BY b.name COLLATE NOCASE ASC, b.id ASC
      `).all(effectiveExt) as AddressBookRow[];
    }
  } catch {
    return [];
  }

  if (!books.length) {
    return [];
  }

  const results: ScopedDirectoryContact[] = [];
  const seenNumbers = new Set<string>();

  const getBookContactsStmt = systemDb.prepare(`
    SELECT id, address_book_id, name, number, extension, mobile, email, company, department, notes
    FROM address_book_contacts
    WHERE address_book_id = ?
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `);

  const getBookExtensionsStmt = systemDb.prepare(`
    SELECT e.extension, e.display_name, e.email
    FROM address_book_extensions abe
    JOIN extensions e ON abe.extension = e.extension
    WHERE abe.address_book_id = ? AND e.is_active = 1
    ORDER BY CAST(e.extension AS INTEGER) ASC, e.extension ASC
  `);

  for (const book of books) {
    // 1. If enabled on this address book, include the extensions assigned to this same book
    if (book.include_assigned_extensions === 1) {
      const extRows = getBookExtensionsStmt.all(book.id) as Array<{ extension: string; display_name: string; email: string }>;
      for (const e of extRows) {
        if (effectiveExt && e.extension === effectiveExt) continue;
        const numKey = e.extension.toLowerCase();
        if (seenNumbers.has(numKey)) continue;
        seenNumbers.add(numKey);

        results.push({
          id: `ab_${book.id}_ext_${e.extension}`,
          name: e.display_name || `Ext ${e.extension}`,
          number: e.extension,
          extension: e.extension,
          mobile: '',
          email: e.email || '',
          company: book.name,
          department: '',
          notes: '',
          addressBookId: book.id,
          addressBookName: book.name
        });
      }
    }

    // 2. Include all manually created / CSV-imported contacts in this address book
    const contactRows = getBookContactsStmt.all(book.id) as AddressBookContactRow[];
    for (const c of contactRows) {
      const primaryNum = (c.number || c.extension || c.mobile || '').trim();
      if (!primaryNum) continue;
      const numKey = primaryNum.toLowerCase();
      if (seenNumbers.has(numKey)) continue;
      seenNumbers.add(numKey);

      results.push({
        id: `ab_${book.id}_c_${c.id}`,
        name: c.name || primaryNum,
        number: primaryNum,
        extension: c.extension || primaryNum,
        mobile: c.mobile || '',
        email: c.email || '',
        company: c.company || book.name,
        department: c.department || '',
        notes: c.notes || '',
        addressBookId: book.id,
        addressBookName: book.name
      });
    }
  }

  return results;
}

// 1. JSON Endpoint for MerlinSIP Softphones
router.get('/api/v1/contacts', (req: Request, res: Response) => {
  const contacts = getScopedContactsForRequest(req);
  return res.json({
    ok: true,
    count: contacts.length,
    contacts: contacts.map(c => ({
      id: c.id,
      name: c.name,
      number: c.number,
      extension: c.extension,
      phone: c.mobile || c.number,
      mobile: c.mobile,
      email: c.email,
      company: c.company,
      department: c.department,
      notes: c.notes,
      address_book_id: c.addressBookId,
      address_book_name: c.addressBookName
    }))
  });
});

// 2. Yealink XML Phonebook
router.get('/phonebook/yealink.xml', (req: Request, res: Response) => {
  const contacts = getScopedContactsForRequest(req);
  broadcastDeviceLog('DESKPHONE', 'INFO', `Yealink shared phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<YealinkIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n`;

  for (const c of contacts) {
    xml += `  <DirectoryEntry>\r\n`;
    xml += `    <Name>${escapeXml(c.name)}</Name>\r\n`;
    xml += `    <Telephone>${escapeXml(c.number)}</Telephone>\r\n`;
    if (c.mobile && c.mobile !== c.number) {
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
  const contacts = getScopedContactsForRequest(req);
  broadcastDeviceLog('DESKPHONE', 'INFO', `Fanvil shared phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<PhoneBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <Name>${escapeXml(c.name)}</Name>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${escapeXml(c.number)}</phonenumber>\r\n`;
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
  const contacts = getScopedContactsForRequest(req);
  broadcastDeviceLog('DESKPHONE', 'INFO', `Grandstream shared phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<AddressBook>\r\n`;

  for (const c of contacts) {
    xml += `  <Contact>\r\n`;
    xml += `    <FirstName>${escapeXml(c.name)}</FirstName>\r\n`;
    xml += `    <Phone>\r\n`;
    xml += `      <phonenumber>${escapeXml(c.number)}</phonenumber>\r\n`;
    xml += `    </Phone>\r\n`;
    xml += `  </Contact>\r\n`;
  }

  xml += `</AddressBook>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// 5. Snom XML Phonebook
router.get('/phonebook/snom.xml', (req: Request, res: Response) => {
  const contacts = getScopedContactsForRequest(req);
  broadcastDeviceLog('DESKPHONE', 'INFO', `Snom shared phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<SnomIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of contacts) {
    xml += '  <DirectoryEntry>\r\n';
    xml += '    <Name>' + escapeXml(c.name) + '</Name>\r\n';
    xml += '    <Telephone>' + escapeXml(c.number) + '</Telephone>\r\n';
    if (c.mobile && c.mobile !== c.number) {
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
  const contacts = getScopedContactsForRequest(req);
  broadcastDeviceLog('DESKPHONE', 'INFO', `Cisco/SPA shared phonebook XML fetched (${contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<CiscoIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of contacts) {
    xml += '  <DirectoryEntry>\r\n';
    xml += '    <Name>' + escapeXml(c.name) + '</Name>\r\n';
    xml += '    <Telephone>' + escapeXml(c.number) + '</Telephone>\r\n';
    xml += '  </DirectoryEntry>\r\n';
  }

  xml += '</CiscoIPPhoneDirectory>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

export default router;
