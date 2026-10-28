import { HandsetAccountConfig } from './yealink';

export function generateSnomConfig(cfg: HandsetAccountConfig): string {
  const transport = cfg.sipTransport.toLowerCase();
  
  let blfXml = '';
  if (cfg.blfKeys && cfg.blfKeys.length > 0) {
    blfXml = `\n    <!-- Programmable Function Keys (BLF / Line Keys) -->\n` + cfg.blfKeys.map(k => `    <fkey idx="${k.key - 1}" perm="R">blf &lt;sip:${k.extension}@${cfg.sipServer}&gt;</fkey>`).join('\n');
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Snom Provisioning Profile                           -->
<!-- Handset Extension: ${cfg.extension} (${cfg.displayName})                       -->
<!-- Generated at: ${new Date().toISOString()}                                      -->
<!-- ============================================================================== -->
<settings>
  <phone-settings>
    <!-- SIP Account 1 Identity Configuration -->
    <user_active idx="1" perm="R">on</user_active>
    <user_name idx="1" perm="R">${cfg.extension}</user_name>
    <user_authname idx="1" perm="R">${cfg.username}</user_authname>
    <user_pass idx="1" perm="R">${cfg.password}</user_pass>
    <user_host idx="1" perm="R">${cfg.sipServer}</user_host>
    <user_port idx="1" perm="R">${cfg.sipPort}</user_port>
    <user_outbound idx="1" perm="R">${cfg.sipServer}:${cfg.sipPort};transport=${transport}</user_outbound>
    <user_realname idx="1" perm="R">${cfg.displayName}</user_realname>
    <user_expiry idx="1" perm="R">3600</user_expiry>
    <user_server_type idx="1" perm="R">default</user_server_type>
    <user_failover idx="1" perm="R">off</user_failover>

    <!-- Codec Priority & Audio Settings -->
    <codec_priority_list idx="1" perm="R">g722,pcmu,pcma,g729,opus</codec_priority_list>
    <codec_size idx="1" perm="R">20</codec_size>
    <dtmf_payload_type idx="1" perm="R">101</dtmf_payload_type>

    <!-- Quality of Service (QoS) & DSCP Marking -->
    <tos_sip perm="R">160</tos_sip> <!-- DSCP 26 / CS3 -->
    <tos_rtp perm="R">184</tos_rtp> <!-- DSCP 46 / EF High-Priority Voice -->
    <vlan_id perm="R">20</vlan_id>
    <vlan_qos perm="R">6</vlan_qos>

    <!-- Time & NTP Configuration -->
    <ntp_server perm="R">pool.ntp.org</ntp_server>
    <timezone perm="R">GBR-0</timezone>
    <tone_scheme perm="R">GB</tone_scheme>

    <!-- Remote Central XML Directory & Phonebook -->
    <dkey_directory perm="R">url ${cfg.dataHandlerUrl}/phonebook/snom.xml</dkey_directory>

    <!-- Auto-Provisioning & Firmware Update Policy -->
    <setting_server perm="R">${cfg.dataHandlerUrl}/provision/snom{mac}.xml</setting_server>
    <update_policy perm="R">auto_update</update_policy>
    <settings_refresh_timer perm="R">86400</settings_refresh_timer>
    <firmware_status perm="R">${cfg.dataHandlerUrl}/firmware/snom/snom_firmware.xml</firmware_status>${blfXml}
  </phone-settings>
</settings>`;
}
