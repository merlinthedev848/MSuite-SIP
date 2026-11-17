import { HandsetAccountConfig, escapeXml, phonebookQuery, resolveProfile, transportName } from './profile';
import { DEFAULT_DIAL_PLAN, resolveVendorClock } from './site';

const CISCO_DIAL = '(999S0|112S0|911S0|*xx.|[0-9*].S4)';

export function generateCiscoPhoneConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const transport = transportName(cfg.sipTransport);
  const book = `${cfg.dataHandlerUrl}/phonebook/cisco.xml?${phonebookQuery(cfg)}`;
  const clock = resolveVendorClock(profile.timezone);
  const dial = profile.dialPlan === DEFAULT_DIAL_PLAN ? CISCO_DIAL : profile.dialPlan;
  const lines = profile.lines.map(line => {
    const n = line.index;
    return `  <Line_Enable_${n}_>Yes</Line_Enable_${n}_>
  <Proxy_${n}_>${escapeXml(cfg.sipServer)}:${cfg.sipPort}</Proxy_${n}_>
  <Outbound_Proxy_${n}_>${escapeXml(cfg.sipServer)}:${cfg.sipPort}</Outbound_Proxy_${n}_>
  <SIP_Transport_${n}_>${transport}</SIP_Transport_${n}_>
  <User_ID_${n}_>${escapeXml(line.extension)}</User_ID_${n}_>
  <Auth_ID_${n}_>${escapeXml(line.username)}</Auth_ID_${n}_>
  <Password_${n}_>${escapeXml(line.password)}</Password_${n}_>
  <Display_Name_${n}_>${escapeXml(line.displayName)}</Display_Name_${n}_>
  <Short_Name_${n}_>${escapeXml(line.label)}</Short_Name_${n}_>
  <Register_Expires_${n}_>${profile.registerExpires}</Register_Expires_${n}_>
  <NAT_Mapping_Enable_${n}_>Yes</NAT_Mapping_Enable_${n}_>
  <NAT_Keep_Alive_Enable_${n}_>Yes</NAT_Keep_Alive_Enable_${n}_>
  <Preferred_Codec_${n}_>G711u</Preferred_Codec_${n}_>
  <Second_Preferred_Codec_${n}_>G711a</Second_Preferred_Codec_${n}_>
  <Third_Preferred_Codec_${n}_>G722</Third_Preferred_Codec_${n}_>
  <Use_Pref_Codec_Only_${n}_>No</Use_Pref_Codec_Only_${n}_>
  <DTMF_Tx_Method_${n}_>AVT</DTMF_Tx_Method_${n}_>
  <Dial_Plan_${n}_>${escapeXml(dial)}</Dial_Plan_${n}_>
  <Default_Ring_${n}_>${line.ringSlot}</Default_Ring_${n}_>`;
  }).join('\n');

  const blf = profile.blfKeys.map((key, index) => {
    const slot = index + 1;
    const value = `fnc=blf;sub=${key.extension}@${cfg.sipServer};nme=${key.label}`;
    return `  <Extended_Function_${slot}_>${escapeXml(value)}</Extended_Function_${slot}_>`;
  }).join('\n');

  const vlan = profile.vlanId > 0 ? 'Yes' : 'No';
  return `<!-- line_count = ${profile.lineCount} -->
<flat-profile>
${lines}
  <Reg_Retry_Intvl_>${profile.registerRetry}</Reg_Retry_Intvl_>
  <SIP_TOS_DiffServ_Value_1_>0x${(profile.sipDscp << 2).toString(16)}</SIP_TOS_DiffServ_Value_1_>
  <RTP_TOS_DiffServ_Value_1_>0x${(profile.voiceDscp << 2).toString(16)}</RTP_TOS_DiffServ_Value_1_>
  <Enable_VLAN_>${vlan}</Enable_VLAN_>
  <VLAN_ID_>${profile.vlanId > 0 ? profile.vlanId : 0}</VLAN_ID_>
  <NTP_Enable_>Yes</NTP_Enable_>
  <Primary_NTP_Server_>${escapeXml(profile.ntpServer)}</Primary_NTP_Server_>
  <Time_Zone_>${escapeXml(clock.ciscoZone)}</Time_Zone_>
  <Daylight_Saving_Time_Rule_>start=3/-1/7/1;end=10/-1/7/2;save=1</Daylight_Saving_Time_Rule_>
  <XML_Directory_Service_Name_>Company Directory</XML_Directory_Service_Name_>
  <XML_Directory_Service_URL_>${book}</XML_Directory_Service_URL_>
  <Resync_On_Reset>Yes</Resync_On_Reset>
  <Resync_Periodic>3600</Resync_Periodic>
  <Profile_Rule>${escapeXml(cfg.dataHandlerUrl)}/provision/spa$MA.cfg</Profile_Rule>
  <Upgrade_Enable_>Yes</Upgrade_Enable_>
  <Upgrade_Rule>${escapeXml(cfg.dataHandlerUrl)}/firmware/cisco/</Upgrade_Rule>
  <Resync_Error_Retry_Delay>${profile.registerRetry}</Resync_Error_Retry_Delay>
${blf}
  <!-- profile-firmware -->
</flat-profile>`;
}
