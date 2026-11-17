import { HandsetAccountConfig, blfKeySlot, escapeXml, phonebookQuery, resolveProfile, transportName } from './profile';
import { resolveVendorClock } from './site';

export function generateGigasetConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const transport = transportName(cfg.sipTransport);
  const book = `${cfg.dataHandlerUrl}/phonebook/gigaset.xml?${phonebookQuery(cfg)}`;
  const lineParams = profile.lines.map(line => `    <param name="Line${line.index}.Active" value="1"/>
    <param name="Line${line.index}.DisplayName" value="${escapeXml(line.displayName)}"/>
    <param name="Line${line.index}.Label" value="${escapeXml(line.label)}"/>
    <param name="Line${line.index}.UserName" value="${escapeXml(line.extension)}"/>
    <param name="Line${line.index}.AuthName" value="${escapeXml(line.username)}"/>
    <param name="Line${line.index}.Password" value="${escapeXml(line.password)}"/>
    <param name="Line${line.index}.Domain" value="${escapeXml(cfg.sipServer)}"/>
    <param name="Line${line.index}.ProxyAddress" value="${escapeXml(cfg.sipServer)}"/>
    <param name="Line${line.index}.ProxyPort" value="${cfg.sipPort}"/>
    <param name="Line${line.index}.OutboundProxy" value="${escapeXml(cfg.sipServer)}"/>
    <param name="Line${line.index}.OutboundProxyPort" value="${cfg.sipPort}"/>
    <param name="Line${line.index}.Transport" value="${transport}"/>
    <param name="Line${line.index}.RegistrationExpires" value="${profile.registerExpires}"/>
    <param name="Line${line.index}.RegisterRetry" value="${profile.registerRetry}"/>
    <param name="Line${line.index}.SessionTimer" value="${profile.sessionExpires}"/>
    <param name="Line${line.index}.DTMFMode" value="RFC2833"/>
    <param name="Line${line.index}.RingTone" value="${line.ringSlot}"/>
    <param name="Line${line.index}.DialPlan" value="${escapeXml(profile.dialPlan)}"/>`).join('\n');

  const keyParams = [
    ...profile.lines.map(line => `    <param name="Key.${line.index}.Type" value="line"/>
    <param name="Key.${line.index}.Line" value="${line.index}"/>
    <param name="Key.${line.index}.Label" value="${escapeXml(line.label)}"/>
    <param name="Key.${line.index}.Value" value="${escapeXml(line.extension)}"/>`),
    ...profile.blfKeys.map(blf => {
      const key = blfKeySlot(blf.key, profile.lineCount);
      return `    <param name="Key.${key}.Type" value="blf"/>
    <param name="Key.${key}.Line" value="1"/>
    <param name="Key.${key}.Label" value="${escapeXml(blf.label)}"/>
    <param name="Key.${key}.Value" value="${escapeXml(blf.extension)}"/>`;
    })
  ].join('\n');

  const vlanOn = profile.vlanId > 0 ? 1 : 0;
  const clock = resolveVendorClock(profile.timezone);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- line_count = ${profile.lineCount} -->
<gigaset-config version="1.0">
  <part name="SIP">
${lineParams}
  </part>
  <part name="AUDIO">
    <param name="CodecList.G722" value="1"/>
    <param name="CodecList.G711u" value="2"/>
    <param name="CodecList.G711a" value="3"/>
    <param name="CodecList.Opus" value="4"/>
    <param name="JitterBuffer.Min" value="20"/>
    <param name="JitterBuffer.Max" value="60"/>
  </part>
  <part name="NETWORK">
    <param name="QoS.VoiceDSCP" value="${profile.voiceDscp}"/>
    <param name="QoS.SIPDSCP" value="${profile.sipDscp}"/>
    <param name="VLAN.VoiceVLANActive" value="${vlanOn}"/>
    <param name="VLAN.VoiceVLANID" value="${profile.vlanId > 0 ? profile.vlanId : 0}"/>
    <param name="VLAN.VoiceVLANPriority" value="${profile.vlanPriority}"/>
  </part>
  <part name="DIRECTORY">
    <param name="OnlineDirActive" value="1"/>
    <param name="OnlineDirName" value="Company Directory"/>
    <param name="OnlineDirUrl" value="${book}"/>
    <param name="OnlineDirRefresh" value="86400"/>
  </part>
  <part name="TIME">
    <param name="NTP.Server" value="${escapeXml(profile.ntpServer)}"/>
    <param name="Time.Zone" value="${escapeXml(clock.gigasetZone)}"/>
    <param name="Time.Locale" value="en-GB"/>
    <param name="Time.DST" value="1"/>
  </part>
  <part name="KEYS">
${keyParams}
  </part>
  <part name="PROVISIONING">
    <param name="ServerURL" value="${escapeXml(cfg.dataHandlerUrl)}/provision/"/>
    <param name="Mode" value="Auto"/>
    <param name="CheckInterval" value="86400"/>
    <param name="FirmwareURL" value="${escapeXml(cfg.dataHandlerUrl)}/firmware/gigaset/"/>
    <param name="RebootAfterUpgrade" value="1"/>
    <!-- profile-firmware -->
  </part>
</gigaset-config>`;
}
