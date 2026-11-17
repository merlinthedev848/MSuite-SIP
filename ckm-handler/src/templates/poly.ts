import { HandsetAccountConfig, escapeXml, phonebookQuery, resolveProfile, transportName } from './profile';
import { resolveVendorClock } from './site';

function polyTransport(transport: string): string {
  const name = transportName(transport);
  if (name === 'TLS') return 'TLS';
  if (name === 'TCP') return 'TCPOnly';
  return 'UDPOnly';
}

export function generatePolyCommonConfig(dataHandlerUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<PHONE_CONFIG>
  <ALL
    tcpIpApp.sntp.address="pool.ntp.org"
    tcpIpApp.sntp.gmtOffset="0"
    tcpIpApp.sntp.daylightSavings.enable="1"
    device.net.vlanId="20"
    device.net.tagDetection="0"
    dialplan.1.digitmap="999|112|911|[0-9*#+].T"
    dialplan.1.digitmap.timeOut="8"
    device.prov.serverType="HTTP"
    device.prov.serverName="${escapeXml(dataHandlerUrl)}/provision"
  />
</PHONE_CONFIG>`;
}

export function generatePolyConfig(cfg: HandsetAccountConfig): string {
  const profile = resolveProfile(cfg);
  const transport = polyTransport(cfg.sipTransport);
  const book = `${cfg.dataHandlerUrl}/phonebook/poly.xml?${phonebookQuery(cfg)}`;
  const attrs: string[] = [];

  for (const line of profile.lines) {
    const n = line.index;
    attrs.push(
      `    reg.${n}.address="${escapeXml(line.extension)}"`,
      `    reg.${n}.auth.userId="${escapeXml(line.username)}"`,
      `    reg.${n}.auth.password="${escapeXml(line.password)}"`,
      `    reg.${n}.displayName="${escapeXml(line.displayName)}"`,
      `    reg.${n}.label="${escapeXml(line.label)}"`,
      `    reg.${n}.type="private"`,
      `    reg.${n}.lineKeys="1"`,
      `    reg.${n}.server.1.address="${escapeXml(cfg.sipServer)}"`,
      `    reg.${n}.server.1.port="${cfg.sipPort}"`,
      `    reg.${n}.server.1.transport="${transport}"`,
      `    reg.${n}.server.1.expires="${profile.registerExpires}"`,
      `    reg.${n}.server.1.register="1"`,
      `    reg.${n}.ringType="ringer${line.ringSlot}"`,
      `    dialplan.${n}.digitmap="${escapeXml(profile.dialPlan)}"`,
      `    dialplan.${n}.digitmap.timeOut="8"`,
      `    lineKey.${n}.category="Line"`,
      `    lineKey.${n}.index="${n}"`
    );
  }

  for (const blf of profile.blfKeys) {
    attrs.push(
      `    attendant.resourceList.${blf.key}.address="${escapeXml(blf.extension)}"`,
      `    attendant.resourceList.${blf.key}.label="${escapeXml(blf.label)}"`,
      `    attendant.resourceList.${blf.key}.type="normal"`
    );
  }

  const vlan = profile.vlanId > 0 ? profile.vlanId : 0;
  const clock = resolveVendorClock(profile.timezone);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!-- line_count = ${profile.lineCount} -->
<PHONE_CONFIG>
  <ALL
${attrs.join('\n')}
    voice.codecPref.G711_Mu="1"
    voice.codecPref.G711_A="2"
    voice.codecPref.G722="3"
    voice.codecPref.Opus="4"
    voice.codecPref.G729_AB="5"
    qos.ip.rtp.dscp="${profile.voiceDscp}"
    qos.ip.rtp.filter_enable="1"
    qos.ip.sip.dscp="${profile.sipDscp}"
    device.net.vlanId="${vlan}"
    device.net.tagDetection="0"
    tcpIpApp.sntp.address="${escapeXml(profile.ntpServer)}"
    tcpIpApp.sntp.gmtOffset="${clock.polyOffsetSeconds}"
    tcpIpApp.sntp.daylightSavings.enable="1"
    lcl.ml.lang="English_United_Kingdom"
    dir.corp.address="${book}"
    device.prov.serverType="HTTP"
    device.prov.serverName="${escapeXml(cfg.dataHandlerUrl)}/provision"
    device.prov.tagDetection="0"
    prov.polling.enabled="1"
    prov.polling.mode="rel"
    prov.polling.period="86400"
    voIpProt.server.1.retryTimeOut="${profile.registerRetry}"
    voIpProt.SIP.specialEvent.checkSync.alwaysReboot="1"
  />
</PHONE_CONFIG>`;
}
