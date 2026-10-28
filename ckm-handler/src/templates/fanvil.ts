import { HandsetAccountConfig } from './yealink';

export function generateFanvilConfig(cfg: HandsetAccountConfig): string {
  const transport = cfg.sipTransport.toUpperCase() === 'TLS' ? '2' : cfg.sipTransport.toUpperCase() === 'TCP' ? '1' : '0';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ============================================================================== -->
<!-- CKM Handler Auto-Generated Fanvil Enterprise XML Profile                       -->
<!-- Extension: ${cfg.extension} (${cfg.displayName})                                -->
<!-- Target PBX: ${cfg.sipServer}:${cfg.sipPort}                                   -->
<!-- ============================================================================== -->
<Fanvil_Config>
  <Global>
    <!-- SIP Line 1 Configuration -->
    <Line_1>
      <Enable>1</Enable>
      <Display_Name>${cfg.displayName}</Display_Name>
      <Username>${cfg.extension}</Username>
      <Auth_Name>${cfg.username}</Auth_Name>
      <Auth_Password>${cfg.password}</Auth_Password>
      <Proxy_Server>${cfg.sipServer}</Proxy_Server>
      <Proxy_Port>${cfg.sipPort}</Proxy_Port>
      <Outbound_Proxy>${cfg.sipServer}</Outbound_Proxy>
      <Outbound_Port>${cfg.sipPort}</Outbound_Port>
      <Transport>${transport}</Transport>
      <Register_Expires>3600</Register_Expires>
      
      <!-- Codec Priorities -->
      <Codec_G711U>1</Codec_G711U>
      <Codec_G711A>2</Codec_G711A>
      <Codec_G722>3</Codec_G722>
      <Codec_OPUS>4</Codec_OPUS>
    </Line_1>

    <!-- Network QoS DSCP -->
    <QoS>
      <Audio_DSCP>46</Audio_DSCP>
      <SIP_DSCP>26</SIP_DSCP>
    </QoS>

    <!-- Corporate Remote Phonebook -->
    <Phonebook>
      <Cloud_URL_1>${cfg.dataHandlerUrl}/phonebook/fanvil.xml</Cloud_URL_1>
      <Cloud_Name_1>Company Directory</Cloud_Name_1>
      <Auto_Update>1</Auto_Update>
    </Phonebook>

    <!-- Firmware & Provisioning Server -->
    <Auto_Provision>
      <Server_Address>${cfg.dataHandlerUrl}/provision</Server_Address>
      <Protocol>HTTP</Protocol>
      <Update_Interval>1</Update_Interval>
      <Firmware_Path>${cfg.dataHandlerUrl}/firmware/fanvil</Firmware_Path>
      <Auto_Upgrade>1</Auto_Upgrade>
    </Auto_Provision>

    <!-- NTP & Time -->
    <Time>
      <NTP_Server>pool.ntp.org</NTP_Server>
    </Time>
  </Global>
</Fanvil_Config>`;
}
