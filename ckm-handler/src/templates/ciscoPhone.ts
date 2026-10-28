import { HandsetAccountConfig } from './yealink';

export function generateCiscoPhoneConfig(cfg: HandsetAccountConfig): string {
  const transport = cfg.sipTransport.toUpperCase() === 'TLS' ? 'TLS' : cfg.sipTransport.toUpperCase() === 'TCP' ? 'TCP' : 'UDP';

  return `<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Cisco SPA / MPP Provisioning Profile                -->
<!-- Handset Extension: ${cfg.extension} (${cfg.displayName})                       -->
<!-- Generated at: ${new Date().toISOString()}                                      -->
<!-- ============================================================================== -->
<flat-profile>
  <!-- Line 1 Configuration -->
  <Line_Enable_1_>Yes</Line_Enable_1_>
  <Proxy_1_>${cfg.sipServer}:${cfg.sipPort}</Proxy_1_>
  <Outbound_Proxy_1_>${cfg.sipServer}:${cfg.sipPort}</Outbound_Proxy_1_>
  <SIP_Transport_1_>${transport}</SIP_Transport_1_>
  <User_ID_1_>${cfg.extension}</User_ID_1_>
  <Auth_ID_1_>${cfg.username}</Auth_ID_1_>
  <Password_1_>${cfg.password}</Password_1_>
  <Display_Name_1_>${cfg.displayName}</Display_Name_1_>
  <Register_Expires_1_>3600</Register_Expires_1_>
  <NAT_Mapping_Enable_1_>Yes</NAT_Mapping_Enable_1_>
  <NAT_Keep_Alive_Enable_1_>Yes</NAT_Keep_Alive_Enable_1_>

  <!-- Audio Codec Priorities -->
  <Preferred_Codec_1_>G711u</Preferred_Codec_1_>
  <Second_Preferred_Codec_1_>G711a</Second_Preferred_Codec_1_>
  <Third_Preferred_Codec_1_>G722</Third_Preferred_Codec_1_>
  <Use_Pref_Codec_Only_1_>No</Use_Pref_Codec_Only_1_>

  <!-- Auto-Provisioning Server & Re-sync Rules -->
  <Resync_On_Reset>Yes</Resync_On_Reset>
  <Resync_Periodic>3600</Resync_Periodic>
  <Profile_Rule>${cfg.dataHandlerUrl}/provision/spa$MA.cfg</Profile_Rule>
  <Resync_Error_Retry_Delay>120</Resync_Error_Retry_Delay>
</flat-profile>`;
}
