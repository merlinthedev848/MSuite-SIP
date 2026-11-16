import {
  HandsetAccountConfig,
  ResolvedProfile,
  blfKeySlot,
  dscpToTos,
  phonebookQuery,
  resolveProfile,
  transportCode,
  yealinkRing
} from './profile';

export { HandsetAccountConfig } from './profile';

function yealinkAccounts(cfg: HandsetAccountConfig, profile: ResolvedProfile): string[] {
  const transport = transportCode(cfg.sipTransport);
  const lines: string[] = [];
  for (const line of profile.lines) {
    const n = line.index;
    lines.push(
      `## SIP Account ${n}`,
      `account.${n}.enable = 1`,
      `account.${n}.label = ${line.label}`,
      `account.${n}.display_name = ${line.displayName}`,
      `account.${n}.auth_name = ${line.username}`,
      `account.${n}.user_name = ${line.extension}`,
      `account.${n}.password = ${line.password}`,
      `account.${n}.sip_server.1.address = ${cfg.sipServer}`,
      `account.${n}.sip_server.1.port = ${cfg.sipPort}`,
      `account.${n}.sip_server.1.transport_type = ${transport}`,
      `account.${n}.sip_server.1.expires = ${profile.registerExpires}`,
      `account.${n}.sip_server.1.retry_counts = 3`,
      `account.${n}.reg_failed_retry_interval = ${profile.registerRetry}`,
      `account.${n}.nat.nat_traversal = 1`,
      `account.${n}.nat.udp_update_enable = 1`,
      `account.${n}.nat.udp_update_time = 30`,
      `account.${n}.session_timer.enable = 1`,
      `account.${n}.session_timer.expires = ${profile.sessionExpires}`,
      `account.${n}.session_timer.refresher = 0`,
      `account.${n}.dtmf.type = 1`,
      `account.${n}.dtmf.dtmf_payload = 101`,
      `account.${n}.dtmf.info_type = 0`,
      `account.${n}.codec.pcmu.enable = 1`,
      `account.${n}.codec.pcmu.priority = 1`,
      `account.${n}.codec.pcma.enable = 1`,
      `account.${n}.codec.pcma.priority = 2`,
      `account.${n}.codec.g722.enable = 1`,
      `account.${n}.codec.g722.priority = 3`,
      `account.${n}.codec.opus.enable = 1`,
      `account.${n}.codec.opus.priority = 4`,
      `account.${n}.codec.g729.enable = 0`,
      `account.${n}.ringtone.ring_type = ${yealinkRing(line.ringSlot)}`,
      `account.${n}.dialplan.digitmap.enable = 1`,
      `account.${n}.dialplan.digitmap.string = ${profile.dialPlan}`,
      ''
    );
  }
  return lines;
}

function yealinkLineKeys(profile: ResolvedProfile): string[] {
  const lines = ['## Line Keys'];
  for (const line of profile.lines) {
    lines.push(
      `linekey.${line.index}.type = 15`,
      `linekey.${line.index}.line = ${line.index}`,
      `linekey.${line.index}.value = ${line.extension}`,
      `linekey.${line.index}.label = ${line.label}`
    );
  }
  lines.push('');
  return lines;
}

function yealinkBlf(profile: ResolvedProfile): string[] {
  if (!profile.blfKeys.length) return [];
  const lines = ['## Programmable Memory / BLF Keys'];
  for (const blf of profile.blfKeys) {
    const key = blfKeySlot(blf.key, profile.lineCount);
    lines.push(
      `linekey.${key}.type = 16`,
      `linekey.${key}.line = 1`,
      `linekey.${key}.value = ${blf.extension}`,
      `linekey.${key}.label = ${blf.label}`
    );
  }
  lines.push('');
  return lines;
}

/** Time, VLAN, dial plan, and provision policy shared by the common and per-MAC files. */
export function yealinkSiteDefaults(cfg: Pick<HandsetAccountConfig, 'dataHandlerUrl'> & Partial<HandsetAccountConfig>): string[] {
  const profile = resolveProfile({
    extension: '',
    username: '',
    password: '',
    displayName: '',
    sipServer: '',
    sipPort: 5060,
    sipTransport: 'UDP',
    ...cfg,
    dataHandlerUrl: cfg.dataHandlerUrl
  });
  const vlanOn = profile.vlanId > 0 ? 1 : 0;
  return [
    `## Dial Plan`,
    `dialplan.digitmap.enable = 1`,
    `dialplan.digitmap.string = ${profile.dialPlan}`,
    `dialplan.digitmap.interdigit_long_timer = 8`,
    `dialplan.digitmap.interdigit_short_timer = 3`,
    ``,
    `## Time & Locale`,
    `local_time.time_zone = +0`,
    `local_time.time_zone_name = United Kingdom(London)`,
    `local_time.ntp_server1 = ${profile.ntpServer}`,
    `local_time.ntp_server2 = time.google.com`,
    `local_time.summer_time = 2`,
    `local_time.dhcp_time = 1`,
    `local_time.time_format = 1`,
    `local_time.date_format = 3`,
    `lang.gui = English`,
    `lang.wui = English`,
    ``,
    `## VLAN & QoS`,
    `network.vlan.internet_port_enable = ${vlanOn}`,
    `network.vlan.internet_port_vid = ${profile.vlanId > 0 ? profile.vlanId : 1}`,
    `network.vlan.internet_port_priority = ${profile.vlanPriority}`,
    `network.vlan.pc_port_enable = 0`,
    `network.qos.rtptos = ${dscpToTos(profile.voiceDscp)}`,
    `network.qos.signaltos = ${dscpToTos(profile.sipDscp)}`,
    ``,
    `## Directory`,
    `features.remote_phonebook.enable = 1`,
    `features.remote_phonebook.flash_time = 3600`,
    ``,
    `## Firmware, Option 66 & Reboot`,
    `auto_provision.server.url = ${cfg.dataHandlerUrl}/provision`,
    `auto_provision.power_on = 1`,
    `auto_provision.repeat.enable = 1`,
    `auto_provision.repeat.minutes = 1440`,
    `auto_provision.weekly.enable = 1`,
    `auto_provision.dhcp_option.enable = 1`,
    `phone_setting.ring_type = Resource:Ring1.wav`,
    ``
  ];
}

export function generateYealinkCommonConfig(dataHandlerUrl: string): string {
  const lines = [
    `#!version:1.0.0.1`,
    `# CKM Handler Yealink common bootstrap. Accounts are in the per-MAC file.`,
    ``,
    ...yealinkSiteDefaults({ dataHandlerUrl })
  ];
  return lines.join('\r\n');
}

export function generateYealinkConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const book = `${cfg.dataHandlerUrl}/phonebook/yealink.xml?${phonebookQuery(cfg)}`;
  const lines = [
    `#!version:1.0.0.1`,
    `# ==============================================================================`,
    `# CKM Handler Auto-Generated Yealink Provisioning Profile`,
    `# Handset Extension: ${cfg.extension} (${cfg.displayName})`,
    `# line_count = ${profile.lineCount}`,
    `# Generated at: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    ``,
    ...yealinkAccounts(cfg, profile),
    ...yealinkSiteDefaults(cfg),
    `remote_phonebook.data.1.url = ${book}`,
    `remote_phonebook.data.1.name = Company Directory`,
    ``,
    ...yealinkLineKeys(profile),
    ...yealinkBlf(profile),
    `<!-- profile-firmware -->`
  ];
  return lines.join('\r\n');
}
