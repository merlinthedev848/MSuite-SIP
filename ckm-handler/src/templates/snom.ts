import { HandsetAccountConfig, escapeXml, phonebookQuery, resolveProfile, transportName } from './profile';
import { resolveVendorClock } from './site';

export function generateSnomConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const transport = transportName(cfg.sipTransport).toLowerCase();
  const book = `${cfg.dataHandlerUrl}/phonebook/snom.xml?${phonebookQuery(cfg)}`;
  const identities: string[] = [];

  for (const line of profile.lines) {
    const n = line.index;
    identities.push(
      `    <user_active idx="${n}" perm="R">on</user_active>`,
      `    <user_name idx="${n}" perm="R">${escapeXml(line.extension)}</user_name>`,
      `    <user_authname idx="${n}" perm="R">${escapeXml(line.username)}</user_authname>`,
      `    <user_pass idx="${n}" perm="R">${escapeXml(line.password)}</user_pass>`,
      `    <user_host idx="${n}" perm="R">${escapeXml(cfg.sipServer)}</user_host>`,
      `    <user_port idx="${n}" perm="R">${cfg.sipPort}</user_port>`,
      `    <user_outbound idx="${n}" perm="R">${escapeXml(cfg.sipServer)}:${cfg.sipPort};transport=${transport}</user_outbound>`,
      `    <user_realname idx="${n}" perm="R">${escapeXml(line.displayName)}</user_realname>`,
      `    <user_idle_text idx="${n}" perm="R">${escapeXml(line.label)}</user_idle_text>`,
      `    <user_expiry idx="${n}" perm="R">${profile.registerExpires}</user_expiry>`,
      `    <user_subscription_expiry idx="${n}" perm="R">${profile.registerExpires}</user_subscription_expiry>`,
      `    <user_server_type idx="${n}" perm="R">default</user_server_type>`,
      `    <user_failover idx="${n}" perm="R">off</user_failover>`,
      `    <codec_priority_list idx="${n}" perm="R">g722,pcmu,pcma,opus</codec_priority_list>`,
      `    <codec_size idx="${n}" perm="R">20</codec_size>`,
      `    <dtmf_payload_type idx="${n}" perm="R">101</dtmf_payload_type>`,
      `    <user_dtmf_info idx="${n}" perm="R">off</user_dtmf_info>`,
      `    <user_ringer idx="${n}" perm="R">Ringer${line.ringSlot}</user_ringer>`,
      `    <user_custom_dialplan idx="${n}" perm="R">${escapeXml(profile.dialPlan)}</user_custom_dialplan>`,
      `    <fkey idx="${n - 1}" context="active" perm="R">line</fkey>`
    );
  }

  const blf = profile.blfKeys.map(key => {
    const requested = Math.max(1, key.key) - 1;
    const idx = requested < profile.lineCount ? requested + profile.lineCount : requested;
    return `    <fkey idx="${idx}" perm="R">blf &lt;sip:${escapeXml(key.extension)}@${escapeXml(cfg.sipServer)}&gt;|${escapeXml(key.label)}</fkey>`;
  });

  const vlan = profile.vlanId > 0 ? profile.vlanId : 0;
  const clock = resolveVendorClock(profile.timezone);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- line_count = ${profile.lineCount} -->
<settings>
  <phone-settings>
${identities.join('\n')}
    <retry_after_failed_register perm="R">${profile.registerRetry}</retry_after_failed_register>
    <session_timer perm="R">${profile.sessionExpires}</session_timer>
    <tos_sip perm="R">${profile.sipDscp << 2}</tos_sip>
    <tos_rtp perm="R">${profile.voiceDscp << 2}</tos_rtp>
    <vlan_id perm="R">${vlan}</vlan_id>
    <vlan_qos perm="R">${profile.vlanPriority}</vlan_qos>
    <ntp_server perm="R">${escapeXml(profile.ntpServer)}</ntp_server>
    <ntp_refresh_timer perm="R">3600</ntp_refresh_timer>
    <timezone perm="R">${escapeXml(clock.snomZone)}</timezone>
    <tone_scheme perm="R">${escapeXml(clock.snomTone)}</tone_scheme>
    <language perm="R">English</language>
    <web_language perm="R">English</web_language>
    <dkey_directory perm="R">url ${book}</dkey_directory>
    <setting_server perm="R">${escapeXml(cfg.dataHandlerUrl)}/provision/snom{mac}.xml</setting_server>
    <update_policy perm="R">auto_update</update_policy>
    <settings_refresh_timer perm="R">86400</settings_refresh_timer>
    <reboot_after_upgrade perm="R">on</reboot_after_upgrade>
    <firmware_status perm="R">${escapeXml(cfg.dataHandlerUrl)}/firmware/snom/snom_firmware.xml</firmware_status>
${blf.join('\n')}
    <!-- profile-firmware -->
  </phone-settings>
</settings>`;
}
