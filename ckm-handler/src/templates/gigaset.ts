import { HandsetAccountConfig } from './yealink';

export function generateGigasetConfig(cfg: HandsetAccountConfig): string {
  const transport = cfg.sipTransport.toUpperCase() === 'TLS' ? 'TLS' : cfg.sipTransport.toUpperCase() === 'TCP' ? 'TCP' : 'UDP';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Gigaset pro Provisioning Profile                     -->
<!-- Targets: Maxwell 2/3/4 & N510/N670/N870 IP Pro Multi-Cell DECT Base Stations     -->
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
    <param name="Line1.OutboundProxy" value="${cfg.sipServer}"/>
    <param name="Line1.OutboundProxyPort" value="${cfg.sipPort}"/>
    <param name="Line1.Transport" value="${transport}"/>
    <param name="Line1.RegistrationExpires" value="3600"/>
    <param name="Line1.RegisterRefresh" value="180"/>
    <param name="Line1.DTMFMode" value="RFC2833"/>
  </part>

  <part name="AUDIO">
    <param name="CodecList.G722" value="1"/>
    <param name="CodecList.G711u" value="2"/>
    <param name="CodecList.G711a" value="3"/>
    <param name="CodecList.Opus" value="4"/>
    <param name="CodecList.G729" value="5"/>
    <param name="JitterBuffer.Min" value="20"/>
    <param name="JitterBuffer.Max" value="60"/>
  </part>

  <part name="NETWORK">
    <param name="QoS.VoiceDSCP" value="46"/> <!-- EF DSCP Voice Priority -->
    <param name="QoS.SIPDSCP" value="26"/>   <!-- CS3 Signaling Priority -->
    <param name="VLAN.VoiceVLANActive" value="1"/>
    <param name="VLAN.VoiceVLANID" value="20"/>
    <param name="VLAN.VoiceVLANPriority" value="6"/>
  </part>

  <part name="DIRECTORY">
    <param name="OnlineDirActive" value="1"/>
    <param name="OnlineDirName" value="Company Directory"/>
    <param name="OnlineDirUrl" value="${cfg.dataHandlerUrl}/phonebook/gigaset.xml"/>
    <param name="OnlineDirRefresh" value="86400"/>
  </part>

  <part name="PROVISIONING">
    <param name="ServerURL" value="${cfg.dataHandlerUrl}/provision/"/>
    <param name="Mode" value="Auto"/>
    <param name="CheckInterval" value="86400"/>
    <param name="FirmwareURL" value="${cfg.dataHandlerUrl}/firmware/gigaset/"/>
  </part>
</gigaset-config>`;
}
