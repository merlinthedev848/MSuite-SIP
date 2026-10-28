import { HandsetAccountConfig } from './yealink';

export function generateGrandstreamConfig(cfg: HandsetAccountConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gs_cheat version="1.0.0">
  <!-- ============================================================================== -->
  <!-- CKM Handler Auto-Generated Grandstream Enterprise Provisioning Profile        -->
  <!-- Extension: ${cfg.extension} (${cfg.displayName})                                -->
  <!-- Target PBX: ${cfg.sipServer}:${cfg.sipPort}                                   -->
  <!-- ============================================================================== -->

  <!-- Account 1 General Settings -->
  <P271>1</P271>                                  <!-- Account 1: 1=Active, 0=Disabled -->
  <P47>${cfg.sipServer}</P47>                     <!-- Primary SIP Server Hostname/IP -->
  <P48>${cfg.sipServer}:${cfg.sipPort}</P48>      <!-- Outbound Proxy -->
  <P35>${cfg.extension}</P35>                     <!-- SIP User ID -->
  <P36>${cfg.username}</P36>                      <!-- Authenticate ID -->
  <P34>${cfg.password}</P34>                      <!-- Authenticate Password -->
  <P3>${cfg.displayName}</P3>                     <!-- User Display Name -->
  <P2312>${cfg.sipTransport.toUpperCase() === 'TLS' ? '2' : cfg.sipTransport.toUpperCase() === 'TCP' ? '1' : '0'}</P2312> <!-- SIP Transport: 0=UDP, 1=TCP, 2=TLS -->

  <!-- Audio Codecs Priority List -->
  <P57>0</P57>                                    <!-- Choice 1: PCMU (G.711u) -->
  <P58>8</P58>                                    <!-- Choice 2: PCMA (G.711a) -->
  <P251>9</P251>                                  <!-- Choice 3: G.722 HD -->
  <P252>123</P252>                                <!-- Choice 4: OPUS Audio -->

  <!-- Network Quality of Service (QoS) & DSCP -->
  <P140>46</P140>                                 <!-- Layer 3 QoS for Audio (DSCP 46 EF) -->
  <P141>26</P141>                                 <!-- Layer 3 QoS for SIP (DSCP 26 CS3) -->

  <!-- Corporate Remote Phonebook & Directory -->
  <P330>${cfg.dataHandlerUrl}/phonebook/grandstream.xml</P330> <!-- XML Phonebook Download URL -->
  <P331>1</P331>                                  <!-- Automatic XML Download Enable: 1=Yes -->
  <P332>720</P332>                                <!-- Phonebook Download Interval (mins) -->

  <!-- Automatic Firmware & Provisioning Server -->
  <P212>${cfg.dataHandlerUrl}/provision</P212>    <!-- Config Server Path -->
  <P192>${cfg.dataHandlerUrl}/firmware/grandstream</P192> <!-- Firmware Server Path -->
  <P238>1</P238>                                  <!-- Check for New Firmware: 1=Always check on boot -->
  <P145>1</P145>                                  <!-- Auto-Provision: 1=HTTP, 2=HTTPS -->

  <!-- Time & Regional -->
  <P30>pool.ntp.org</P30>                         <!-- NTP Time Server -->
  <P64>0</P64>                                    <!-- Time Zone Offset -->
</gs_cheat>`;
}
