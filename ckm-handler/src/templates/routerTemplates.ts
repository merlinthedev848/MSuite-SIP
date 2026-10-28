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
  notes?: string;
}

// 1. MikroTik RouterOS (v6 & v7)
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

${cfg.enableQos ? `## 4. Quality of Service (QoS), Fasttrack Bypass & DSCP Marking
# Fasttrack Bypass: Essential so Fasttrack doesn't drop DSCP tags or reorder RTP
/ip firewall filter add chain=forward action=accept connection-mark=voip-conn place-before=0 comment="VoIP Bypass Fasttrack"

# Mangle: Tag SIP Signaling (DSCP 24 / CS3) & RTP Audio Streams (DSCP 46 / EF)
/ip firewall mangle add chain=prerouting protocol=udp port=5060,5061 action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP SIP Signaling"
/ip firewall mangle add chain=prerouting protocol=udp port=10000-20000 action=mark-connection new-connection-mark=voip-conn passthrough=yes comment="VoIP RTP Media Streams"
/ip firewall mangle add chain=prerouting connection-mark=voip-conn action=set-priority new-priority=6 passthrough=yes comment="VoIP High Priority Packet Mark"

# Queue Tree: Guarantee 10Mbps low-jitter voice bandwidth to PBX core
/queue tree add name=CKM-VOICE-PRIORITY parent=global priority=1 limit-at=10M max-limit=100M packet-mark=no-mark comment="VoIP Guaranteed Low Jitter Bandwidth"` : ''}

## 5. Security Pinholes to PBX
/ip firewall filter add chain=forward src-address=${ipPrefix}.0/24 dst-address=${cfg.pbxServer} action=accept comment="Allow Voice VLAN to PBX Core"

/log info message="CKM Handler VoIP Router Deployment for ${cfg.siteName} Complete!"
`;
}

// 2. Ubiquiti EdgeRouter (EdgeOS / Vyatta)
export function generateUbiquitiConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `#!/bin/vbash
# ==============================================================================
# CKM Handler Ubiquiti EdgeRouter / EdgeOS Provisioning Script
# Site: ${cfg.siteName} | Target: ${cfg.brand.toUpperCase()} ${cfg.model || ''}
# ==============================================================================

source /opt/vyatta/etc/functions/script-template
configure

${cfg.disableSipAlg ? `# 1. Disable SIP ALG
set system conntrack modules sip disable` : ''}

# 2. Configure Voice VLAN ${cfg.voiceVlanId}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} address ${cfg.voiceSubnet}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} description "CKM-VOICE"

# 3. Dedicated Voice DHCP Scope with Option 66 for Handset Auto-Provisioning
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 default-router ${subnetBase}
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 dns-server 1.1.1.1
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 dns-server 8.8.8.8
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 start ${ipPrefix}.10 stop ${ipPrefix}.240
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 tftp-server-name "${cfg.dataHandlerUrl}/provision/"

${cfg.enableQos ? `# 4. QoS DSCP EF (46) Traffic Shaper
set traffic-control smart-queue VoIP-QoS upload bandwidth 50mbit
set traffic-control smart-queue VoIP-QoS download bandwidth 100mbit` : ''}

commit
save
exit
echo "[CKM Handler] Ubiquiti EdgeRouter configuration applied successfully."
`;
}

// 3. Ubiquiti UniFi Gateway (UDM-Pro, UDM-SE, UXG)
export function generateUniFiConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `#!/bin/sh
# ==============================================================================
# CKM Handler UniFi Gateway (UDM-Pro / UDM-SE / UXG) Configuration Snippet
# Site: ${cfg.siteName} | Model: ${cfg.model || 'UniFi Gateway'}
# ==============================================================================

echo "[CKM Handler] Configuring UniFi Gateway for VoIP optimization..."

${cfg.disableSipAlg ? `# 1. Disable SIP ALG Kernel Conntrack Module
modprobe -r nf_nat_sip 2>/dev/null || true
modprobe -r nf_conntrack_sip 2>/dev/null || true
cat << 'EOF' > /etc/modprobe.d/disable-sip-alg.conf
blacklist nf_nat_sip
blacklist nf_conntrack_sip
EOF` : ''}

# 2. Add DHCP Option 66 / 160 to Dnsmasq for Automatic Phone Bootstrapping
cat << 'EOF' > /run/dnsmasq.conf.d/ckm-voip-option66.conf
# CKM Handler Deskphone Option 66
dhcp-option=tag:vlan${cfg.voiceVlanId},66,"${cfg.dataHandlerUrl}/provision/"
dhcp-option=tag:vlan${cfg.voiceVlanId},160,"${cfg.dataHandlerUrl}/provision/"
EOF

# Reload dnsmasq configuration without dropping active connections
kill -HUP $(pidof dnsmasq) 2>/dev/null || true

echo "UniFi Voice network ${ipPrefix}.0/24 (VLAN ${cfg.voiceVlanId}) optimized with Option 66."
`;
}

// 4. pfSense / Netgate Firewall
export function generatePfSenseConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `<!-- ============================================================================== -->
<!-- CKM Handler pfSense / Netgate VoIP Optimization Profile                          -->
<!-- Site: ${cfg.siteName} | Model: ${cfg.model || 'Netgate / pfSense'}              -->
<!-- ============================================================================== -->
<!--
CRITICAL PFSENSE VOIP STEPS IN WEB GUI:
1. Outbound NAT: Navigate to Firewall > NAT > Outbound
   - Switch to "Hybrid Outbound NAT"
   - Add Mappings for Interface WAN:
     * Source: ${ipPrefix}.0/24 (Voice VLAN ${cfg.voiceVlanId})
     * Destination: Any
     * Port or Range: *
     * Translation: Interface address
     * STATIC PORT: CHECKED [X]  <-- CRITICAL! Prevents port 5060 rewriting!

2. System Tunables (Disable SIP scrub/ALG):
   - Navigate to System > Advanced > Firewall & NAT
   - TFTP Proxy: Disabled
   - Scrub: Enabled with Fragment reassembly

3. DHCP Server (Option 66):
   - Services > DHCP Server > Voice VLAN (${cfg.voiceVlanId})
   - TFTP Server: ${cfg.dataHandlerUrl}/provision/

4. Traffic Shaper (PRIQ or HFSC Priority Queue):
   - Priority 7: Voice Audio (RTP UDP 10000:20000)
   - Priority 6: SIP Signaling (UDP 5060:5061)
-->

# Automated Shell Command Snippet for pfSense CLI (Option 66 & State Clearing):
pfctl -k 0.0.0.0/0 -k ${cfg.pbxServer}
echo "[CKM Handler] Cleared stale states to PBX ${cfg.pbxServer}."
`;
}

// 5. OPNsense Firewall
export function generateOpnSenseConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `# ==============================================================================
# CKM Handler OPNsense Firewall VoIP Optimization Script
# Site: ${cfg.siteName} | Target: ${cfg.model || 'OPNsense Appliance'}
# ==============================================================================

# 1. Manual Outbound NAT Static Port Rule (Required for Asterisk/FreePBX)
# Ensure the Voice subnet (${ipPrefix}.0/24) has "Static Port: YES" enabled in:
# Firewall > NAT > Outbound -> Edit Rule -> [X] Static Port

# 2. Set Option 66 in Kea / Dnsmasq
# Under Services > Dnsmasq DNS > Advanced options:
dhcp-option=tag:opt66,66,"${cfg.dataHandlerUrl}/provision/"

# 3. Flushes existing stale NAT states to PBX
pluginctl -s pf
pfctl -k ${ipPrefix}.0/24
echo "[CKM Handler] OPNsense VoIP rules active for ${cfg.siteName}."
`;
}

// 6. Cisco IOS / ISR / Catalyst Router
export function generateCiscoConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `! ==============================================================================
! CKM Handler Cisco IOS / Catalyst Router Script
! Site: ${cfg.siteName} | Target: ${cfg.brand.toUpperCase()} ${cfg.model || ''}
! ==============================================================================

configure terminal

${cfg.disableSipAlg ? `! 1. Disable SIP ALG (Inspection & NAT Mangling)
no ip nat service sip udp port 5060
no ip nat service sip tcp port 5060
no ip inspect name firewall_rules sip` : ''}

! 2. Voice VLAN ${cfg.voiceVlanId} Sub-Interface
interface Vlan${cfg.voiceVlanId}
 description CKM-VOICE-NETWORK
 ip address ${subnetBase} 255.255.255.0
 no shutdown

! 3. Dedicated Voice DHCP Pool with Option 66 Auto-Provisioning
ip dhcp pool CKM_VOICE_POOL
 network ${ipPrefix}.0 255.255.255.0
 default-router ${subnetBase}
 dns-server 1.1.1.1 8.8.8.8
 option 66 ascii "${cfg.dataHandlerUrl}/provision/"
 option 150 ip ${subnetBase}
 exit

${cfg.enableQos ? `! 4. MQC Quality of Service (QoS) & DSCP EF (46) Prioritization
class-map match-any CKM-VOIP-SIGNAL
 match access-group name ACL-VOIP-SIGNAL
class-map match-any CKM-VOIP-MEDIA
 match access-group name ACL-VOIP-RTP

ip access-list extended ACL-VOIP-SIGNAL
 permit udp any any range 5060 5061
ip access-list extended ACL-VOIP-RTP
 permit udp any any range 10000 20000

policy-map CKM-QOS-POLICY
 class CKM-VOIP-MEDIA
  priority percent 30
  set dscp ef
 class CKM-VOIP-SIGNAL
  bandwidth percent 5
  set dscp cs3
 class class-default
  fair-queue` : ''}

end
write memory
`;
}

// 7. Cisco Catalyst Switch (Voice VLAN Port Configuration)
export function generateCiscoSwitchConfig(cfg: RouterConfigParams): string {
  return `! ==============================================================================
! CKM Handler Cisco Catalyst Switchport Voice VLAN Configuration
! Site: ${cfg.siteName} | Switch: ${cfg.model || 'Catalyst 2960/3650/3850/9200/9300'}
! ==============================================================================

configure terminal

! 1. Create Data & Voice VLANs
vlan ${cfg.voiceVlanId}
 name CKM-VOICE
 state active
exit

! 2. Apply Voice VLAN to Deskphone Access Ports (e.g. GigabitEthernet 1/0/1 - 48)
interface range GigabitEthernet 1/0/1 - 48
 switchport mode access
 switchport access vlan 10
 switchport voice vlan ${cfg.voiceVlanId}
 spanning-tree portfast
 trust device cisco-phone
 auto qos voip cisco-phone
 mls qos trust cos
 no shutdown
exit

end
write memory
`;
}

// 8. Cisco Meraki MX Security Appliance
export function generateMerakiConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];

  return `# ==============================================================================
# CKM Handler Cisco Meraki MX Dashboard Configuration Guide
# Site: ${cfg.siteName} | Target: Meraki ${cfg.model || 'MX Series'}
# ==============================================================================

1. Disable SIP ALG:
   - Go to Security & SD-WAN > Configure > Firewall
   - Under "Stateful firewall", locate "SIP ALG" and toggle to: DISABLED

2. Voice VLAN Setup:
   - Security & SD-WAN > Addressing & VLANs > Add VLAN:
     * Name: CKM-Voice
     * Subnet: ${cfg.voiceSubnet}
     * MX IP: ${subnetBase}
     * VLAN ID: ${cfg.voiceVlanId}

3. DHCP Custom Option 66 (Handset Provisioning):
   - Under CKM-Voice VLAN > DHCP options:
     * Option: 66
     * Type: Text
     * Value: "${cfg.dataHandlerUrl}/provision/"

4. Traffic Shaping & QoS:
   - Security & SD-WAN > Traffic Shaping:
     * Add rule for "VoIP & video conferencing"
     * Bandwidth limit: Unlimited
     * Priority: High
     * PCP / DSCP tag: 46 (EF)
`;
}

// 9. DrayTek Vigor Series
export function generateDraytekConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler DrayTek Vigor CLI Script
# Site: ${cfg.siteName} | Target: DrayTek ${cfg.model || 'Vigor 2865/2927'}
# ==============================================================================

# 1. Disable SIP ALG (Essential for audio stability)
sys sip_alg 0

# 2. Add DHCP Option 66 for Voice VLAN
srv dhcp opt add 1 66 string ${cfg.dataHandlerUrl}/provision/

# 3. Hardware VoIP QoS Prioritization
qos on
qos class 1 voip on
qos class 1 reserve 30

# 4. Save and reboot
sys reboot
`;
}

// 10. Fortinet FortiGate (FortiOS 6.x & 7.x)
export function generateFortiGateConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Fortinet FortiGate CLI Script (FortiOS)
# Site: ${cfg.siteName} | Target: FortiGate ${cfg.model || '40F/60F/80F'}
# ==============================================================================

# 1. Delete SIP Session Helper (Disable SIP ALG)
config system session-helper
  show
  # Note: Typically entry 13 is SIP (port 5060)
  delete 13
end

# 2. Disable SIP Processing in VoIP Profile
config voip profile
  edit "CKM-VoIP-Profile"
    config sip
      set status disable
      set rtp disable
    end
  next
end

# 3. Configure SIP NAT Traversal without ALG Mangling
config system settings
  set default-voip-alg-mode kernel-helper-based
  set sip-helper disable
  set sip-nat-trace disable
end

# 4. DHCP Server Option 66 for Voice VLAN ${cfg.voiceVlanId}
config system dhcp server
  edit 2
    set interface "vlan${cfg.voiceVlanId}"
    set default-gateway ${cfg.voiceSubnet.split('/')[0]}
    set netmask 255.255.255.0
    set tftp-server "${cfg.dataHandlerUrl}/provision/"
  next
end
`;
}

// 11. SonicWall TZ & NSA
export function generateSonicWallConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler SonicWall SonicOS CLI Commands
# Site: ${cfg.siteName} | Target: SonicWall ${cfg.model || 'TZ Series'}
# ==============================================================================

configure
# 1. Disable SIP Transformations (SIP ALG)
voip
  no sip-transformation
  no b2bua
  exit

# 2. Voice VLAN DHCP Option 66
dhcp-server
  option-object ckm-opt66
    number 66
    type string
    string "${cfg.dataHandlerUrl}/provision/"
    exit
  exit

# 3. Commit settings
commit
`;
}

// 12. Sophos XGS / XG Firewall
export function generateSophosConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Sophos XGS Firewall Console Script
# Site: ${cfg.siteName} | Target: Sophos ${cfg.model || 'XGS Series'}
# ==============================================================================

# 1. Unload SIP ALG kernel module via Sophos Advanced Shell:
console> system system_modules sip unload

# 2. Check SIP module status:
console> system system_modules show

# 3. Create Voice QoS Rule in Web GUI:
# Firewall > Rules > Add Rule
# Source: Voice VLAN (${cfg.voiceVlanId})
# Destination: WAN / PBX (${cfg.pbxServer})
# DSCP Marking: 46 (Expedited Forwarding - EF)
`;
}

// 13. TP-Link Omada Gateway
export function generateOmadaConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler TP-Link Omada SDN Gateway Guide
# Site: ${cfg.siteName} | Target: Omada ${cfg.model || 'ER605 / ER7206'}
# ==============================================================================

1. Disable SIP ALG in Omada Controller:
   - Settings > Network Security > Attack Defense
   - Uncheck: [ ] SIP ALG
   - Click Save

2. Configure Voice Network with Option 66:
   - Settings > Wired Networks > LAN
   - Edit Voice VLAN (${cfg.voiceVlanId}):
     * Subnet: ${cfg.voiceSubnet}
     * DHCP Option 66 / Boot Server: ${cfg.dataHandlerUrl}/provision/

3. Quality of Service (QoS):
   - Transmission > Quality of Service > Enable Bandwidth Control for Voice IP range
`;
}

// 14. Generic Linux / Dnsmasq / ISC DHCP
export function generateDnsmasqConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `# ==============================================================================
# CKM Handler Linux dnsmasq / iptables VoIP Provisioning Script
# Site: ${cfg.siteName} | Model: ${cfg.model || 'Generic Linux / Gateway'}
# ==============================================================================

# 1. Bypass conntrack SIP helper in iptables (Disable SIP ALG)
iptables -t raw -A PREROUTING -p udp -m udp --dport 5060 -j NOTRACK
iptables -t raw -A PREROUTING -p udp -m udp --dport 5061 -j NOTRACK
iptables -t raw -A OUTPUT -p udp -m udp --dport 5060 -j NOTRACK
iptables -t raw -A OUTPUT -p udp -m udp --dport 5061 -j NOTRACK

# 2. dnsmasq Voice DHCP & Option 66 snippet:
cat << 'EOF' >> /etc/dnsmasq.d/ckm-voice.conf
interface=eth0.${cfg.voiceVlanId}
dhcp-range=${ipPrefix}.10,${ipPrefix}.240,255.255.255.0,24h
dhcp-option=3,${subnetBase}
dhcp-option=6,1.1.1.1,8.8.8.8
dhcp-option=66,"${cfg.dataHandlerUrl}/provision/"
EOF

systemctl restart dnsmasq
`;
}

// Router Master Dispatcher
export function generateRouterConfig(cfg: RouterConfigParams): { filename: string; mimeType: string; content: string } {
  const brand = (cfg.brand || '').toLowerCase();
  const safeSite = cfg.siteName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  if (brand.includes('ubiquiti') || brand.includes('edgerouter')) {
    return {
      filename: `ckm-router-${safeSite}.sh`,
      mimeType: 'text/x-shellscript',
      content: generateUbiquitiConfig(cfg)
    };
  } else if (brand.includes('unifi')) {
    return {
      filename: `ckm-unifi-${safeSite}.sh`,
      mimeType: 'text/x-shellscript',
      content: generateUniFiConfig(cfg)
    };
  } else if (brand.includes('pfsense')) {
    return {
      filename: `ckm-pfsense-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generatePfSenseConfig(cfg)
    };
  } else if (brand.includes('opnsense')) {
    return {
      filename: `ckm-opnsense-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateOpnSenseConfig(cfg)
    };
  } else if (brand.includes('switch') || brand.includes('catalyst-switch')) {
    return {
      filename: `ckm-catalyst-switch-${safeSite}.cfg`,
      mimeType: 'text/plain',
      content: generateCiscoSwitchConfig(cfg)
    };
  } else if (brand.includes('cisco')) {
    return {
      filename: `ckm-cisco-${safeSite}.cfg`,
      mimeType: 'text/plain',
      content: generateCiscoConfig(cfg)
    };
  } else if (brand.includes('meraki')) {
    return {
      filename: `ckm-meraki-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateMerakiConfig(cfg)
    };
  } else if (brand.includes('draytek')) {
    return {
      filename: `ckm-draytek-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateDraytekConfig(cfg)
    };
  } else if (brand.includes('fortinet') || brand.includes('fortigate')) {
    return {
      filename: `ckm-fortigate-${safeSite}.conf`,
      mimeType: 'text/plain',
      content: generateFortiGateConfig(cfg)
    };
  } else if (brand.includes('sonicwall')) {
    return {
      filename: `ckm-sonicwall-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateSonicWallConfig(cfg)
    };
  } else if (brand.includes('sophos')) {
    return {
      filename: `ckm-sophos-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateSophosConfig(cfg)
    };
  } else if (brand.includes('omada') || brand.includes('tp-link')) {
    return {
      filename: `ckm-omada-${safeSite}.txt`,
      mimeType: 'text/plain',
      content: generateOmadaConfig(cfg)
    };
  } else if (brand.includes('linux') || brand.includes('dnsmasq')) {
    return {
      filename: `ckm-linux-${safeSite}.sh`,
      mimeType: 'text/x-shellscript',
      content: generateDnsmasqConfig(cfg)
    };
  } else {
    // Default: MikroTik RouterOS (.rsc)
    return {
      filename: `ckm-mikrotik-${safeSite}.rsc`,
      mimeType: 'text/plain',
      content: generateMikroTikConfig(cfg)
    };
  }
}
