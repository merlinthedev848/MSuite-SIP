import { HandsetAccountConfig } from './yealink';

export function generatePolyConfig(cfg: HandsetAccountConfig): string {
  const transport = cfg.sipTransport.toUpperCase() === 'TLS' ? 'TLS' : cfg.sipTransport.toUpperCase() === 'TCP' ? 'TCPOnly' : 'UDPOnly';

  let blfXml = '';
  if (cfg.blfKeys && cfg.blfKeys.length > 0) {
    blfXml = '\n' + cfg.blfKeys.map(k => `    attendant.resourceList.${k.key}.address="${k.extension}" attendant.resourceList.${k.key}.label="${k.label}" attendant.resourceList.${k.key}.type="normal"`).join('\n');
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Poly / Polycom Provisioning Profile                 -->
<!-- Handset Extension: ${cfg.extension} (${cfg.displayName})                       -->
<!-- Generated at: ${new Date().toISOString()}                                      -->
<!-- ============================================================================== -->
<PHONE_CONFIG>
  <ALL
    reg.1.address="${cfg.extension}"
    reg.1.auth.userId="${cfg.username}"
    reg.1.auth.password="${cfg.password}"
    reg.1.displayName="${cfg.displayName}"
    reg.1.label="${cfg.displayName}"
    reg.1.type="private"
    reg.1.lineKeys="1"
    reg.1.server.1.address="${cfg.sipServer}"
    reg.1.server.1.port="${cfg.sipPort}"
    reg.1.server.1.transport="${transport}"
    reg.1.server.1.expires="3600"
    reg.1.server.1.register="1"
    
    nat.ip=""
    nat.signalPort=""
    nat.mediaPortStart=""
    
    voice.codecPref.G711_Mu="1"
    voice.codecPref.G711_A="2"
    voice.codecPref.G722="3"
    voice.codecPref.Opus="4"
    voice.codecPref.G729_AB="5"
    
    qos.ip.rtp.dscp="46"
    qos.ip.rtp.filter_enable="1"
    qos.ip.sip.dscp="24"
    
    device.net.vlanId="20"
    device.net.tagDetection="0"
    
    tcpIpApp.sntp.address="pool.ntp.org"
    tcpIpApp.sntp.gmtOffset="0"
    
    dir.corp.address="${cfg.dataHandlerUrl}/phonebook/poly.xml"
    dir.corp.port="443"
    
    device.prov.serverType="HTTP"
    device.prov.serverName="${cfg.dataHandlerUrl}/provision"
    device.prov.tagDetection="0"${blfXml}
  />
</PHONE_CONFIG>`;
}
