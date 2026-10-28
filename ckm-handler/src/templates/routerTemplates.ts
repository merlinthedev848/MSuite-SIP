export interface RouterConfigParams {
  siteName: string;
  brand: string;
  model?: string;
  macAddress?: string;
  lanSubnet: string;
  voiceVlanId: number;
  voiceSubnet: string;
  pbxServer: string;
  dataHandlerUrl: string;
  disableSipAlg: boolean;
  enableQos: boolean;
}

export function generateMikroTikConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `# ==============================================================================
# CKM Handler Auto-Generated MikroTik RouterOS Script
# Site: ${cfg.siteName} | Target: ${cfg.brand.toUpperCase()} ${cfg.model || ''}
# Generated at: ${new Date().toISOString()}
# ==============================================================================

/log info message="Applying CKM Handler VoIP Router Configuration for ${cfg.siteName}..."

${cfg.disableSipAlg ? `## 1. Disable SIP ALG (Prevents Header Mangling & Audio Dropouts)
/ip firewall service-port disable sip
/log info message="[CKM Handler] SIP ALG successfully disabled"` : ''}

## 2. Voice VLAN & Interface Setup
/interface vlan add name=VLAN-VOICE vlan-id=${cfg.voiceVlanId} interface=bridge comment="CKM Voice Isolated Network"
/ip address add address=${cfg.voiceSubnet} interface=VLAN-VOICE network=${ipPrefix}.0

## 3. Dedicated Voice DHCP Server & Option 66 Auto-Provisioning
/ip dhcp-server option add name=opt66-ckm code=66 value="'${cfg.dataHandlerUrl}/provision/'"
/ip pool add name=pool-voice ranges=${ipPrefix}.10-${ipPrefix}.240
/ip dhcp-server add name=dhcp-voice interface=VLAN-VOICE address-pool=pool-voice lease-time=1d disabled=no
/ip dhcp-server network add address=${ipPrefix}.0/24 gateway=${subnetBase} dns-server=1.1.1.1,8.8.8.8 dhcp-option=opt66-ckm comment="Voice Subnet with Option 66"

${cfg.enableQos ? `## 4. Quality of Service (QoS) & DSCP Prioritization
# Mangle: Mark SIP Signaling (DSCP 24 / CS3) & RTP Audio Streams (DSCP 46 / EF)
/ip firewall mangle add chain=prerouting protocol=udp port=5060,5061 action=set-priority new-priority=6 passthrough=yes comment="VoIP SIP Signaling Priority"
/ip firewall mangle add chain=prerouting protocol=udp port=10000-20000 action=set-priority new-priority=7 passthrough=yes comment="VoIP RTP Voice Packets Priority"

# Queue Tree: Guarantee minimum 5Mbps low-jitter bandwidth for PBX & Handsets
/queue tree add name=CKM-VOICE-PRIORITY parent=global priority=1 limit-at=5M max-limit=100M packet-mark=no-mark comment="VoIP Guaranteed Low Jitter Bandwidth"` : ''}

## 5. Security & PBX Pinholes
/ip firewall filter add chain=forward src-address=${ipPrefix}.0/24 dst-address=${cfg.pbxServer} action=accept comment="Allow Voice VLAN to PBX Core"

/log info message="CKM Handler VoIP Router Deployment Complete!"
`;
}

export function generateUbiquitiConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `#!/bin/vbash
# ==============================================================================
# CKM Handler Ubiquiti EdgeRouter / EdgeOS Provisioning Script
# Site: ${cfg.siteName}
# ==============================================================================

source /opt/vyatta/etc/functions/script-template
configure

# 1. Disable SIP ALG
set system conntrack modules sip disable

# 2. Voice VLAN ${cfg.voiceVlanId}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} address ${cfg.voiceSubnet}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} description "CKM-VOICE"

# 3. DHCP Option 66 for Handset Provisioning
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 default-router ${subnetBase}
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 dns-server 1.1.1.1
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 start ${ipPrefix}.10 stop ${ipPrefix}.240
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 tftp-server-name "${cfg.dataHandlerUrl}/provision/"

# 4. Save and Commit
commit
save
exit
echo "[CKM Handler] Ubiquiti router configured successfully."
`;
}

export function generateCiscoConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `! ==============================================================================
! CKM Handler Cisco IOS / Catalyst Router Script
! Site: ${cfg.siteName}
! ==============================================================================

configure terminal

! 1. Disable SIP ALG (Inspection)
no ip nat service sip udp port 5060
no ip nat service sip tcp port 5060

! 2. Voice VLAN Interface
interface Vlan${cfg.voiceVlanId}
 description CKM-VOICE-VLAN
 ip address ${subnetBase} 255.255.255.0
 no shutdown

! 3. DHCP Pool with Option 66 Handset Auto-Provisioning
ip dhcp pool CKM_VOICE_POOL
 network ${ipPrefix}.0 255.255.255.0
 default-router ${subnetBase}
 dns-server 1.1.1.1 8.8.8.8
 option 66 ascii "${cfg.dataHandlerUrl}/provision/"
 exit

end
write memory
`;
}

export function generateRouterConfig(cfg: RouterConfigParams): { filename: string; mimeType: string; content: string } {
  const brand = (cfg.brand || '').toLowerCase();
  if (brand.includes('ubiquiti') || brand.includes('edgerouter') || brand.includes('unifi')) {
    return {
      filename: `ckm-router-${cfg.siteName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.sh`,
      mimeType: 'text/x-shellscript',
      content: generateUbiquitiConfig(cfg)
    };
  } else if (brand.includes('cisco')) {
    return {
      filename: `ckm-router-${cfg.siteName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.cfg`,
      mimeType: 'text/plain',
      content: generateCiscoConfig(cfg)
    };
  } else {
    // Default: MikroTik RouterOS (.rsc)
    return {
      filename: `ckm-router-${cfg.siteName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.rsc`,
      mimeType: 'text/plain',
      content: generateMikroTikConfig(cfg)
    };
  }
}
