/**
 * Generates provisioned configs and checks per-handset logs stay separate.
 * Run with DATA_DIR pointed at an empty temp directory.
 */
import fs from 'fs';
import path from 'path';
import { generateDefaultHandsetConfig } from '../src/templates/catalog';
import { HandsetAccountConfig } from '../src/templates/yealink';
import { sanitizeBlfKeys } from '../src/templates/blf';
import { recordDeviceProvisionEvent, readDeviceProvisionLog } from '../src/services/deviceProvisionLog';
import { buildGigasetPhonebookXml, buildPolyPhonebookXml } from '../src/routes/directory';
import systemDb from '../src/database/systemDb';

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function sample(lineCount?: number): HandsetAccountConfig {
  const cfg: HandsetAccountConfig = {
    extension: '101',
    username: '101',
    password: 'test-pass',
    displayName: 'Front Desk',
    sipServer: 'pbx.example.test',
    sipPort: 5060,
    sipTransport: 'UDP',
    dataHandlerUrl: 'https://handler.example.test',
    directoryToken: 'tok',
    blfKeys: [{ key: 1, extension: '200', label: 'Boss' }]
  };
  if (lineCount !== undefined) cfg.lineCount = lineCount;
  return cfg;
}

function requireAll(body: string, needles: string[], label: string): void {
  for (const needle of needles) {
    assert(body.includes(needle), `${label} missing ${needle}`);
  }
}

const yealink = generateDefaultHandsetConfig('yealink', sample(), 'T46U');
requireAll(yealink, [
  'account.1.enable = 1',
  'account.1.label = Front Desk',
  'account.1.display_name = Front Desk',
  'account.1.user_name = 101',
  'account.1.dtmf.type = 1',
  'account.1.dtmf.dtmf_payload = 101',
  'account.1.codec.g722.priority = 3',
  'account.1.codec.opus.priority = 4',
  'account.1.sip_server.1.expires = 3600',
  'account.1.ringtone.ring_type = Ring1.wav',
  'account.1.dialplan.digitmap.string = 999|112|911|[0-9*#+].T',
  'account.2.enable = 1',
  'account.2.label = Front Desk L2',
  'account.2.ringtone.ring_type = Ring2.wav',
  'account.2.sip_server.1.expires = 3600',
  'linekey.1.type = 15',
  'linekey.1.line = 1',
  'linekey.2.type = 15',
  'linekey.2.line = 2',
  'linekey.3.type = 16',
  'linekey.3.value = 200',
  'local_time.ntp_server1 = pool.ntp.org',
  'local_time.time_zone_name = United Kingdom(London)',
  'lang.gui = English',
  'network.vlan.internet_port_enable = 1',
  'network.vlan.internet_port_vid = 20',
  'remote_phonebook.data.1.url = https://handler.example.test/phonebook/yealink.xml?extension=101&amp;token=tok',
  'auto_provision.dhcp_option.enable = 1',
  'auto_provision.repeat.minutes = 1440',
  'firmware.url = https://handler.example.test/firmware/yealink/T46U-108.86.0.70.rom',
  'line_count = 2'
], 'Yealink T46U');
assert(!yealink.includes('linekey.1.type = 16'), 'Yealink BLF overwrote line key 1');

const newYork = generateDefaultHandsetConfig('yealink', { ...sample(), timezone: 'America/New_York', dialPlan: '911|1[2-9]xx' }, 'T46U');
assert(newYork.includes('local_time.time_zone = -5'), 'Yealink did not take the PBX timezone offset');
assert(newYork.includes('local_time.time_zone_name = United States-Eastern Time'), 'Yealink did not take the PBX timezone name');
assert(newYork.includes('dialplan.digitmap.string = 911|1[2-9]xx'), 'Yealink did not take the PBX dial plan');

const poly = generateDefaultHandsetConfig('poly', sample(), 'VVX450');
const gigaset = generateDefaultHandsetConfig('gigaset', sample(), 'Maxwell3');
const cisco = generateDefaultHandsetConfig('cisco', sample(), 'SPA504G');
assert(poly.includes('/phonebook/poly.xml?extension=101'), 'Poly profile has no company directory');
assert(gigaset.includes('/phonebook/gigaset.xml?extension=101'), 'Gigaset profile has no company directory');
assert(cisco.includes('/phonebook/cisco.xml?extension=101'), 'Cisco profile has no company directory');
assert(cisco.includes('XML_Directory_Service_URL_'), 'Cisco directory URL is not a phone setting');

const nySnom = generateDefaultHandsetConfig('snom', { ...sample(), timezone: 'America/New_York' }, 'D735');
assert(nySnom.includes('<timezone perm="R">USA-5</timezone>'), 'Snom stayed on London for a New York PBX');
assert(nySnom.includes('<tone_scheme perm="R">US</tone_scheme>'), 'Snom tone scheme stayed on GB');

const rejected = sanitizeBlfKeys([{ extension: 'abc', label: 'Nope', key: 1 }]);
assert(!rejected.ok, 'a non-numeric BLF target was accepted');
const accepted = sanitizeBlfKeys([{ extension: '200', label: 'Boss', key: 1 }, { extension: '', label: 'skip', key: 2 }]);
assert(accepted.ok && accepted.keys.length === 1 && accepted.keys[0].extension === '200', 'valid BLF key was dropped');

const bookContact = { id: '1', name: 'Ada Lovelace', number: '200', extension: '200', mobile: '07700', email: '', company: '', department: '', notes: '', addressBookId: 1, addressBookName: 'Company' };
const polyBook = buildPolyPhonebookXml([{ ...bookContact, mobile: '' }]);
const gigasetBook = buildGigasetPhonebookXml([bookContact]);
assert(polyBook.includes('<ct>200</ct>') && polyBook.includes('<ln>Lovelace</ln>'), 'Poly phonebook XML is not a directory item');
assert(gigasetBook.includes('<hm>200</hm>') && gigasetBook.includes('<mb>07700</mb>'), 'Gigaset phonebook XML is not a Maxwell entry');

const grandstream = generateDefaultHandsetConfig('grandstream', sample(), 'GXP2170');
requireAll(grandstream, [
  '<P271>1</P271>',
  '<P3>Front Desk</P3>',
  '<P270>Front Desk</P270>',
  '<P401>1</P401>',
  '<P407>Front Desk</P407>',
  '<P417>Front Desk L2</P417>',
  '<P404>101</P404>',
  '<P32>60</P32>',
  '<P412>60</P412>',
  '<P2302>1</P2302>',
  '<P2402>1</P2402>',
  '<P290>',
  '<P459>',
  '<P104>1</P104>',
  '<P423>2</P423>',
  '<P64>GMT+0BST-1,M3.5.0/01:00:00,M10.5.0/02:00:00</P64>',
  '<P1362>en</P1362>',
  '<P30>pool.ntp.org</P30>',
  '<P51>20</P51>',
  '<P330>3</P330>',
  '<P331>https://handler.example.test/phonebook/grandstream.xml?extension=101&amp;token=tok</P331>',
  '<P237>https://handler.example.test/provision</P237>',
  '<P194>1</P194>',
  'line_count = 2'
], 'Grandstream GXP2170');

const oneLine = generateDefaultHandsetConfig('yealink', sample(1), 'T46U');
assert(oneLine.includes('account.1.enable = 1'), 'explicit one-line profile lost account 1');
assert(!oneLine.includes('account.2.enable = 1'), 'explicit line_count=1 still emitted account 2');
assert(oneLine.includes('line_count = 1'), 'explicit line count was not written');

const snom = generateDefaultHandsetConfig('snom', sample(), 'D735');
requireAll(snom, [
  '<user_active idx="1"',
  '<user_active idx="2"',
  '<user_realname idx="2"',
  '<user_idle_text idx="2" perm="R">Front Desk L2</user_idle_text>',
  '<user_expiry idx="1" perm="R">3600</user_expiry>',
  '<dtmf_payload_type idx="2"',
  '<user_ringer idx="1" perm="R">Ringer1</user_ringer>',
  '<user_ringer idx="2" perm="R">Ringer2</user_ringer>',
  '<fkey idx="0" context="active" perm="R">line</fkey>',
  '<fkey idx="1" context="active" perm="R">line</fkey>',
  '<timezone perm="R">GBR-0</timezone>',
  '<tone_scheme perm="R">GB</tone_scheme>',
  '<ntp_server perm="R">pool.ntp.org</ntp_server>',
  '<vlan_id perm="R">20</vlan_id>',
  'phonebook/snom.xml?extension=101',
  'line_count = 2'
], 'Snom D735');

systemDb.prepare(`
  INSERT INTO extensions (extension, sip_username, sip_password, display_name, is_active)
  VALUES ('101', '101', 'test-pass', 'Front Desk', 1)
`).run();
systemDb.prepare(`
  INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, provision_log)
  VALUES ('001565AAAA01', 'yealink', 'T46U', '101', 'Front Desk', '[]')
`).run();
systemDb.prepare(`
  INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label, provision_log)
  VALUES ('001565BBBB02', 'grandstream', 'GXP2170', '101', 'Back Desk', '[]')
`).run();

recordDeviceProvisionEvent('001565AAAA01', {
  level: 'SUCCESS',
  kind: 'provision',
  message: 'Template served for phone A only. password=test-pass'
}, ['test-pass']);
recordDeviceProvisionEvent('001565BBBB02', {
  level: 'ERROR',
  kind: 'error',
  message: 'Config generation failed for phone B only.'
});
recordDeviceProvisionEvent('001565AAAA01', {
  level: 'INFO',
  kind: 'fetch',
  message: 'Second fetch for phone A only.'
});

const phoneA = readDeviceProvisionLog('001565AAAA01');
const phoneB = readDeviceProvisionLog('001565BBBB02');
if (!phoneA || !phoneB) throw new Error('Expected phone logs for A and B');
assert(phoneA.store === 'physical_handsets', 'phone A log was not stored on its handset row');
assert(phoneB.store === 'physical_handsets', 'phone B log was not stored on its handset row');
const aText = phoneA.logs.map(item => item.message).join('\n');
const bText = phoneB.logs.map(item => item.message).join('\n');
assert(aText.includes('phone A only'), 'phone A log missing its own events');
assert(aText.includes('Second fetch for phone A only'), 'phone A log did not keep both of its events');
assert(!aText.includes('phone B'), 'phone A log mixed in phone B');
assert(bText.includes('phone B only'), 'phone B log missing its own event');
assert(!bText.includes('phone A'), 'phone B log mixed in phone A');
assert(!aText.includes('test-pass'), 'phone A log kept a password');
assert(aText.includes('password=[redacted]'), 'password was not redacted');
assert(phoneA.logs.length === 2 && phoneB.logs.length === 1, 'event counts leaked across handsets');

const dbFile = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'system.db') : '';
assert(dbFile && fs.existsSync(dbFile), 'expected the temp system database');
assert(!dbFile.startsWith(path.resolve(process.cwd(), 'data')), 'test wrote into the repo data directory');

console.log(JSON.stringify({
  ok: true,
  models: ['Yealink T46U', 'Grandstream GXP2170', 'Snom D735'],
  yealinkLines: ['account.1', 'account.2'],
  grandstreamLines: ['P271', 'P401'],
  explicitOneLineOmitsAccount2: true,
  phoneAEvents: phoneA.logs.length,
  phoneBEvents: phoneB.logs.length,
  stores: [phoneA.store, phoneB.store],
  dataDir: process.env.DATA_DIR || ''
}, null, 2));
