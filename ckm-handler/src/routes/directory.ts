import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import systemDb from '../database/systemDb';
import { APP_SECRET_KEY } from '../config';
import { broadcastDeviceLog } from '../services/telemetryStream';

const router = Router();

/**
 * Per-extension directory token (HMAC-SHA256, truncated). Stateless and unguessable without
 * APP_SECRET_KEY. Embedded in provisioned deskphone phonebook URLs so a phone can only ever
 * fetch the address books attached to its own extension.
 */
export function directoryTokenForExtension(extension: string): string {
  return crypto
    .createHmac('sha256', APP_SECRET_KEY)
    .update(`directory:${String(extension).trim()}`)
    .digest('hex')
    .slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Resolves the extension a directory request is authorised for, or null.
 * Accepted credentials:
 *   1. ?extension=<ext>&token=<hmac>  (deskphones; token embedded at provisioning time)
 *   2. HTTP Basic <sip_username>:<sip_password>  (MerlinSIP softphone)
 *   3. Admin Bearer / session token (Admin UI preview)
 * Anything else is rejected — no anonymous or enumerable access.
 */
function resolveAuthorisedExtension(req: Request): string | null {
  const queryExt = String(req.query.extension || req.query.ext || '').trim();
  const queryToken = String(req.query.token || '').trim();
  if (queryExt && queryToken && safeEqual(queryToken, directoryTokenForExtension(queryExt))) {
    return queryExt;
  }

  const authHeader = String(req.headers.authorization || '');
  const basic = /^Basic\s+(.+)$/i.exec(authHeader);
  if (basic) {
    try {
      const decoded = Buffer.from(basic[1], 'base64').toString('utf-8');
      const sep = decoded.indexOf(':');
      if (sep > 0) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        const row = systemDb.prepare(`
          SELECT extension, sip_password FROM extensions
          WHERE (sip_username = ? OR extension = ?) AND is_active = 1
          LIMIT 1
        `).get(user, user) as { extension: string; sip_password: string } | undefined;
        if (row && safeEqual(pass, String(row.sip_password || ''))) {
          return row.extension;
        }
      }
    } catch {}
  }

  // Allow admin preview if admin token matches
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader) || (req.query.token ? [null, String(req.query.token)] : null);
  if (bearer && bearer[1]) {
    try {
      const session = systemDb.prepare(`
        SELECT u.id FROM admin_sessions s
        JOIN admin_users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
      `).get(bearer[1]);
      if (session) {
        return queryExt || '__admin__';
      }
    } catch {}
  }

  return null;
}

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
 * Only returns contacts from Global Shared Address Books explicitly attached to the authorized
 * extension. Never exposes unassigned or platform-wide PBX extensions.
 */
function getScopedContactsForRequest(req: Request): { authorized: boolean; contacts: ScopedDirectoryContact[] } {
  const authExt = resolveAuthorisedExtension(req);
  if (!authExt) {
    return { authorized: false, contacts: [] };
  }

  const rawBookId = String(req.query.book_id || req.query.bookId || '').trim();
  let books: AddressBookRow[] = [];
  try {
    if (authExt === '__admin__') {
      if (rawBookId && /^\d+$/.test(rawBookId)) {
        const book = systemDb.prepare('SELECT id, name, description, include_assigned_extensions FROM shared_address_books WHERE id = ?').get(parseInt(rawBookId, 10)) as AddressBookRow | undefined;
        if (book) books = [book];
      } else {
        books = systemDb.prepare('SELECT id, name, description, include_assigned_extensions FROM shared_address_books ORDER BY name COLLATE NOCASE ASC, id ASC').all() as AddressBookRow[];
      }
    } else if (rawBookId && /^\d+$/.test(rawBookId)) {
      const book = systemDb.prepare(`
        SELECT b.id, b.name, b.description, b.include_assigned_extensions
        FROM shared_address_books b
        JOIN address_book_extensions abe ON b.id = abe.address_book_id
        WHERE b.id = ? AND abe.extension = ?
      `).get(parseInt(rawBookId, 10), authExt) as AddressBookRow | undefined;
      if (book) books = [book];
    } else {
      books = systemDb.prepare(`
        SELECT b.id, b.name, b.description, b.include_assigned_extensions
        FROM shared_address_books b
        JOIN address_book_extensions abe ON b.id = abe.address_book_id
        WHERE abe.extension = ?
        ORDER BY b.name COLLATE NOCASE ASC, b.id ASC
      `).all(authExt) as AddressBookRow[];
    }
  } catch {
    return { authorized: true, contacts: [] };
  }

  if (!books.length) {
    return { authorized: true, contacts: [] };
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
    // 1. If enabled on this address book, include colleague extensions assigned to this same book
    if (book.include_assigned_extensions === 1) {
      const extRows = getBookExtensionsStmt.all(book.id) as Array<{ extension: string; display_name: string; email: string }>;
      for (const e of extRows) {
        if (authExt !== '__admin__' && e.extension === authExt) continue;
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

    // 2. Include all contacts in this address book
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

  return { authorized: true, contacts: results };
}

// 1. JSON Endpoint for MerlinSIP Softphones
router.get('/api/v1/contacts', (req: Request, res: Response) => {
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Extension credentials or directory token required.' });
  }

  return res.json({
    ok: true,
    count: result.contacts.length,
    contacts: result.contacts.map(c => ({
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
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(401).send(`<?xml version="1.0" encoding="UTF-8"?>\r\n<YealinkIPPhoneDirectory>\r\n  <Title>Unauthorized</Title>\r\n</YealinkIPPhoneDirectory>`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Yealink shared phonebook XML fetched (${result.contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<YealinkIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n`;

  for (const c of result.contacts) {
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
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(401).send(`<?xml version="1.0" encoding="UTF-8"?>\r\n<PhoneBook><Title>Unauthorized</Title></PhoneBook>`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Fanvil shared phonebook XML fetched (${result.contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<PhoneBook>\r\n`;

  for (const c of result.contacts) {
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
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(401).send(`<?xml version="1.0" encoding="UTF-8"?>\r\n<AddressBook><Title>Unauthorized</Title></AddressBook>`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Grandstream shared phonebook XML fetched (${result.contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<AddressBook>\r\n`;

  for (const c of result.contacts) {
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
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(401).send(`<?xml version="1.0" encoding="UTF-8"?>\r\n<SnomIPPhoneDirectory><Title>Unauthorized</Title></SnomIPPhoneDirectory>`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Snom shared phonebook XML fetched (${result.contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<SnomIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of result.contacts) {
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
  const result = getScopedContactsForRequest(req);
  if (!result.authorized) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(401).send(`<?xml version="1.0" encoding="UTF-8"?>\r\n<CiscoIPPhoneDirectory><Title>Unauthorized</Title></CiscoIPPhoneDirectory>`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Cisco/SPA shared phonebook XML fetched (${result.contacts.length} entries)`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\r\n<CiscoIPPhoneDirectory>\r\n  <Title>Shared Directory</Title>\r\n  <Prompt>Select Contact</Prompt>\r\n';

  for (const c of result.contacts) {
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
