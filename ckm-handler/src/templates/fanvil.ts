import { HandsetAccountConfig, blfKeySlot, escapeXml, phonebookQuery, resolveProfile, transportCode } from './profile';

export function generateFanvilConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const transport = transportCode(cfg.sipTransport);
  const book = `${cfg.dataHandlerUrl}/phonebook/fanvil.xml?${phonebookQuery(cfg)}`;
  const lineXml = profile.lines.map(line => `    <Line_${line.index}>
      <Enable>1</Enable>
      <Display_Name>${escapeXml(line.displayName)}</Display_Name>
      <Label>${escapeXml(line.label)}</Label>
      <Username>${escapeXml(line.extension)}</Username>
      <Auth_Name>${escapeXml(line.username)}</Auth_Name>
      <Auth_Password>${escapeXml(line.password)}</Auth_Password>
      <Proxy_Server>${escapeXml(cfg.sipServer)}</Proxy_Server>
      <Proxy_Port>${cfg.sipPort}</Proxy_Port>
      <Outbound_Proxy>${escapeXml(cfg.sipServer)}</Outbound_Proxy>
      <Outbound_Port>${cfg.sipPort}</Outbound_Port>
      <Transport>${transport}</Transport>
      <Register_Expires>${profile.registerExpires}</Register_Expires>
      <Register_Retry>${profile.registerRetry}</Register_Retry>
      <Session_Timer>${profile.sessionExpires}</Session_Timer>
      <DTMF>RFC2833</DTMF>
      <DTMF_Payload>101</DTMF_Payload>
      <Ring>${line.ringSlot}</Ring>
      <Codec_G711U>1</Codec_G711U>
      <Codec_G711A>2</Codec_G711A>
      <Codec_G722>3</Codec_G722>
      <Codec_OPUS>4</Codec_OPUS>
      <Dial_Plan>${escapeXml(profile.dialPlan)}</Dial_Plan>
    </Line_${line.index}>`).join('\n');

  const keys = [
    ...profile.lines.map(line => `      <Key index="${line.index}" type="line" line="${line.index}" value="${escapeXml(line.extension)}" label="${escapeXml(line.label)}"/>`),
    ...profile.blfKeys.map(blf => {
      const key = blfKeySlot(blf.key, profile.lineCount);
      return `      <Key index="${key}" type="blf" line="1" value="${escapeXml(blf.extension)}" label="${escapeXml(blf.label)}"/>`;
    })
  ].join('\n');

  const vlanOn = profile.vlanId > 0 ? 1 : 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- line_count = ${profile.lineCount} -->
<Fanvil_Config>
  <Global>
${lineXml}
    <QoS>
      <Audio_DSCP>${profile.voiceDscp}</Audio_DSCP>
      <SIP_DSCP>${profile.sipDscp}</SIP_DSCP>
    </QoS>
    <VLAN>
      <Enable>${vlanOn}</Enable>
      <ID>${profile.vlanId > 0 ? profile.vlanId : 0}</ID>
      <Priority>${profile.vlanPriority}</Priority>
    </VLAN>
    <Phonebook>
      <Cloud_URL_1>${book}</Cloud_URL_1>
      <Cloud_Name_1>Company Directory</Cloud_Name_1>
      <Auto_Update>1</Auto_Update>
    </Phonebook>
    <Auto_Provision>
      <Server_Address>${escapeXml(cfg.dataHandlerUrl)}/provision</Server_Address>
      <Protocol>HTTP</Protocol>
      <Update_Interval>1</Update_Interval>
      <Firmware_Path>${escapeXml(cfg.dataHandlerUrl)}/firmware/fanvil</Firmware_Path>
      <Auto_Upgrade>1</Auto_Upgrade>
      <Reboot_After_Upgrade>1</Reboot_After_Upgrade>
      <!-- profile-firmware -->
    </Auto_Provision>
    <Time>
      <NTP_Server>${escapeXml(profile.ntpServer)}</NTP_Server>
      <Time_Zone>${escapeXml(profile.timezone)}</Time_Zone>
      <DST>1</DST>
      <Locale>en-GB</Locale>
    </Time>
    <Line_Keys>
${keys}
    </Line_Keys>
  </Global>
</Fanvil_Config>`;
}
