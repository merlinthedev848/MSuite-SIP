import { HandsetAccountConfig } from './yealink';

export function generateGigasetConfig(cfg: HandsetAccountConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Gigaset pro Provisioning Profile                     -->
<!-- Handset Extension: ${cfg.extension} (${cfg.displayName})                       -->
<!-- Generated at: ${new Date().toISOString()}                                      -->
<!-- ============================================================================== -->
<gigaset-config version="1.0">
  <part name="SIP">
    <param name="Line1.Active" value="1"/>
    <param name="Line1.DisplayName" value="${cfg.displayName}"/>
    <param name="Line1.UserName" value="${cfg.extension}"/>
    <param name="Line1.AuthName" value="${cfg.username}"/>
    <param name="Line1.Password" value="${cfg.password}"/>
    <param name="Line1.Domain" value="${cfg.sipServer}"/>
    <param name="Line1.ProxyAddress" value="${cfg.sipServer}"/>
    <param name="Line1.ProxyPort" value="${cfg.sipPort}"/>
    <param name="Line1.RegistrationExpires" value="3600"/>
  </part>
  <part name="PROVISIONING">
    <param name="ServerURL" value="${cfg.dataHandlerUrl}/provision/"/>
    <param name="Mode" value="Auto"/>
  </part>
</gigaset-config>`;
}
