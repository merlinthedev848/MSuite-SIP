import { HandsetAccountConfig } from './yealink';

export function generateSnomConfig(cfg: HandsetAccountConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Snom Provisioning Profile                           -->
<!-- Handset Extension: ${cfg.extension} (${cfg.displayName})                       -->
<!-- Generated at: ${new Date().toISOString()}                                      -->
<!-- ============================================================================== -->
<settings>
  <phone-settings>
    <!-- SIP Account 1 -->
    <user_active idx="1" perm="R">on</user_active>
    <user_name idx="1" perm="R">${cfg.extension}</user_name>
    <user_authname idx="1" perm="R">${cfg.username}</user_authname>
    <user_pass idx="1" perm="R">${cfg.password}</user_pass>
    <user_host idx="1" perm="R">${cfg.sipServer}</user_host>
    <user_port idx="1" perm="R">${cfg.sipPort}</user_port>
    <user_realname idx="1" perm="R">${cfg.displayName}</user_realname>
    <user_expiry idx="1" perm="R">3600</user_expiry>
    <user_server_type idx="1" perm="R">default</user_server_type>

    <!-- Codecs -->
    <codec_priority_list idx="1" perm="R">g722,pcmu,pcma,g729,opus</codec_priority_list>

    <!-- Remote Directory & Phonebook -->
    <dkey_directory perm="R">url ${cfg.dataHandlerUrl}/phonebook/snom.xml</dkey_directory>

    <!-- Auto-Provisioning Server -->
    <setting_server perm="R">${cfg.dataHandlerUrl}/provision/snom{mac}.xml</setting_server>
    <update_policy perm="R">auto_update</update_policy>
  </phone-settings>
</settings>`;
}
