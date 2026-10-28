export interface RouterConfigParams {
  siteName: string;
  brand: string;
  model?: string;
  macAddress?: string;
  lanSubnet?: string;
  voiceVlanId: number;
  voiceSubnet: string;
  pbxServer: string;
  dataHandlerUrl: string;
  disableSipAlg?: boolean;
  enableQos?: boolean;
  notes?: string;
}

// 1. MikroTik RouterOS (v6 & v7)
export function generateMikroTikConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));
  const disableAlg = cfg.disableSipAlg !== false;
  const enableQos = cfg.enableQos !== false;

  return `# ==============================================================================
# CKM Handler Auto-Generated MikroTik RouterOS Script
# Site: ${cfg.siteName} | Target: ${cfg.brand.toUpperCase()} ${cfg.model || 'Router'}
# Firmware / Architecture: RouterOS v7.16.1+ (ARM / ARM64 / TILE / MMIPS / x86)
# Generated at: ${new Date().toISOString()}
# ==============================================================================

/log info message="Applying CKM Handler VoIP Router Configuration for ${cfg.siteName}..."

${disableAlg ? `## 1. Disable SIP ALG (Prevents RTP Audio One-Way & NAT Dropouts)
/ip firewall service-port disable sip
/log info message="[CKM Handler] MikroTik SIP ALG successfully disabled"` : ''}

## 2. Voice VLAN & Isolated Bridge Setup
/interface vlan add name=VLAN-VOICE vlan-id=${cfg.voiceVlanId} interface=bridge comment="CKM Voice Isolated Network"
/ip address add address=${cfg.voiceSubnet} interface=VLAN-VOICE network=${ipPrefix}.0

## 3. Dedicated Voice DHCP Scope & Option 66 Auto-Provisioning
/ip dhcp-server option add name=opt66-ckm code=66 value="'${cfg.dataHandlerUrl}/provision/'"
/ip dhcp-server option add name=opt150-ckm code=150 value="'${cfg.pbxServer}'"
/ip pool add name=pool-voice ranges=${ipPrefix}.10-${ipPrefix}.240
/ip dhcp-server add name=dhcp-voice interface=VLAN-VOICE address-pool=pool-voice lease-time=1d disabled=no
/ip dhcp-server network add address=${ipPrefix}.0/24 gateway=${subnetBase} dns-server=1.1.1.1,8.8.8.8 dhcp-option=opt66-ckm,opt150-ckm comment="Voice Subnet with Option 66/150"

${enableQos ? `## 4. Quality of Service (QoS), Fasttrack Bypass & DSCP Priority
# Fasttrack Bypass: Essential so hardware Fasttrack does not strip DSCP or reorder RTP audio
/ip firewall filter add chain=forward action=accept connection-mark=voip-conn place-before=0 comment="VoIP Bypass Fasttrack"

# Mangle: Mark SIP Signaling (DSCP 24 / CS3) & RTP Media Streams (DSCP 46 / EF)
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

// 2. TP-Link (Omada SDN Gateways & Aginet / Archer VoIP & Wi-Fi 6 Routers — VZ230v, AX1800, EX220v, VX220-G2v, VR2100v, ER605)
export function generateTpLinkConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));
  const disableAlg = cfg.disableSipAlg !== false;
  const enableQos = cfg.enableQos !== false;

  return `# ==============================================================================
# CKM Handler TP-Link VoIP Deployment Guide & Configuration Script
# Site: ${cfg.siteName} | Target Model: ${cfg.model || 'VZ230v / AX1800 / EX220v / ER605'}
# Operating System: TP-Link Aginet OS / Archer Wi-Fi 6 / Omada SDN
# Generated at: ${new Date().toISOString()}
# ==============================================================================

### SECTION A: TP-LINK AGINET VZ230v / EX220v / VX220-G2v ISP VOIP GATEWAY SETUP
${disableAlg ? `1. Disable Hardware SIP ALG Helper:
   - Log into Web GUI: http://192.168.1.1 (or ${subnetBase})
   - Navigate to: Advanced > Network > NAT > ALG
   - Uncheck: [ ] SIP ALG
   - Click "Save" (Crucial: prevents NAT port corruption and 30-sec dropouts)` : ''}

2. Voice VLAN 20 & High-Priority Traffic Tagging:
   - Navigate to: Advanced > Network > IPTV/VLAN
   - Select Mode: Custom
   - Voice VLAN ID: ${cfg.voiceVlanId}
   - 802.1Q Priority / CoS: 6 (Voice / Telephony)
   - Assign to LAN Ports: LAN 2, LAN 3, LAN 4 (for IP Deskphones)

3. Integrated RJ11 FXS Analog Phone Port 1 & Port 2 SIP Provisioning:
   - Navigate to: Advanced > Telephony > Telephone Numbers > Add Account:
     * Telephony Provider: Other
     * SIP Server / Registrar: ${cfg.pbxServer}
     * SIP Server Port: 5060 (UDP/TLS)
     * Outbound Proxy: ${cfg.pbxServer}
     * Register Expiry Time: 3600 seconds
     * Codecs Priority: 1. G.722 HD, 2. G.711a (PCMA), 3. G.729
     * DTMF Method: RFC 2833 / SIP INFO
     * T.38 Fax Support: Enabled (High-Speed Error Correction)

4. Auto-Provisioning Option 66 for Connected IP Deskphones:
   - Navigate to: Advanced > Network > LAN Settings > DHCP Server
   - Advanced Settings > Option 66 (TFTP / HTTP Provisioning Server):
     * Value: "${cfg.dataHandlerUrl}/provision/"
   - Connected Yealink, Snom, Grandstream, Poly, and Fanvil handsets will
     automatically configure on boot via this gateway.

${enableQos ? `5. Hardware QoS (Quality of Service) Bandwidth Reservation:
   - Navigate to: Advanced > QoS
   - Enable Quality of Service: [x] Checked
   - Set Guaranteed VoIP Reserve: Minimum 10 Mbps Up / 10 Mbps Down
   - Voice Packet DSCP Tag: DSCP 46 (EF - Expedited Forwarding)` : ''}

------------------------------------------------------------------------------
### SECTION B: TP-LINK ARCHER AX1800 (ARCHER AX20 / AX21 / AX23) WI-FI 6 SETUP
${disableAlg ? `1. Disable SPI Firewall SIP ALG:
   - Log into Web GUI: http://tplinkwifi.net or http://192.168.0.1
   - Navigate to: Advanced > Security > ALG
   - Uncheck: [ ] SIP ALG
   - Click "Save"` : ''}

2. QoS Voice Prioritization:
   - Navigate to: Advanced > QoS
   - Toggle QoS: ON
   - Set Total Bandwidth (e.g. 100 Mbps Download / 20 Mbps Upload)
   - Under Device Priority, set IP Phone / Softphone device to "High Priority"

3. DHCP Server & DNS Configuration:
   - Navigate to: Advanced > Network > DHCP Server
   - Primary DNS: 1.1.1.1, Secondary DNS: 8.8.8.8
   - Set Gateway Address: ${subnetBase}

------------------------------------------------------------------------------
### SECTION C: TP-LINK OMADA SDN CONTROLLER SETUP (ER605 / ER7206 / ER8411)
${disableAlg ? `1. Disable SIP ALG in Omada Controller:
   - Navigate to: Network Security > Attack Defense > ALG
   - Uncheck: [ ] SIP ALG
   - Click Save to push immediately to the gateway` : ''}

2. Voice VLAN & Subnet Setup:
   - Navigate to: Settings > Wired Networks > LAN
   - Click "Create New LAN":
     * Name: Voice-Network
     * Purpose: VLAN
     * VLAN ID: ${cfg.voiceVlanId}
     * IP Subnet: ${cfg.voiceSubnet}
     * Gateway IP: ${subnetBase}

3. DHCP Auto-Provisioning Option 66:
   - In Voice-Network DHCP settings:
     * DHCP Mode: DHCP Server
     * Range: ${ipPrefix}.10 - ${ipPrefix}.240
     * Primary DNS: 1.1.1.1, Secondary DNS: 8.8.8.8
     * DHCP Options > Custom Options:
       - Option Code: 66
       - Type: String
       - Value: "${cfg.dataHandlerUrl}/provision/"

------------------------------------------------------------------------------
### SECTION D: STANDALONE ARCHER / VR-SERIES (TELNET / SSH / CLI SCRIPT)
${disableAlg ? `# Disable SIP ALG helper on Broadcom/Qualcomm chipset:
sys alg -s sip disable
# Or on OpenWrt / Linux-based TP-Link models:
uci set firewall.@alg[0].sip='0'
uci commit firewall
/etc/init.d/firewall restart` : ''}

# Set Voice DHCP Option 66 in dnsmasq:
cat << 'EOF' >> /etc/dnsmasq.conf
dhcp-option=tag:vlan${cfg.voiceVlanId},option:tftp-server,"${cfg.dataHandlerUrl}/provision/"
dhcp-option=tag:vlan${cfg.voiceVlanId},66,"${cfg.dataHandlerUrl}/provision/"
EOF
/etc/init.d/dnsmasq restart
`;
}

// 3. Technicolor / Thomson (Homeware & OpenWrt Gateways - DGA4130, DGA4132, TG588v2, TG789vac, CGA4233)
export function generateTechnicolorConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));
  const disableAlg = cfg.disableSipAlg !== false;
  const enableQos = cfg.enableQos !== false;

  return `#!/bin/sh
# ==============================================================================
# CKM Handler Technicolor / Thomson Gateway VoIP Optimization Script
# Target: ${cfg.model || 'DGA4130 / DGA4132 / TG588v2 / TG789vac / CGA4233'}
# Operating System: Technicolor Homeware / OpenWrt (UCI & BusyBox)
# Generated at: ${new Date().toISOString()}
# ==============================================================================

echo "[*] Applying CKM Handler VoIP profile to Technicolor Gateway..."

${disableAlg ? `## 1. Disable SIP ALG (Critical on Technicolor Broadcom/Homeware gateways)
# The default Technicolor SIP ALG intercepts UDP 5060 and rewrites contact headers,
# causing one-way audio and registration drops with Asterisk/FreePBX.

# Disable via UCI Firewall Helper:
uci set firewall.@helper[0].disabled='1' 2>/dev/null || true
for i in 0 1 2 3; do
  HELPER_NAME=$(uci get firewall.@helper[$i].helper 2>/dev/null || true)
  if [ "$HELPER_NAME" = "sip" ]; then
    uci set firewall.@helper[$i].disabled='1'
  fi
done
uci commit firewall

# Unload kernel conntrack SIP NAT modules immediately:
rmmod nf_nat_sip 2>/dev/null || true
rmmod nf_conntrack_sip 2>/dev/null || true
echo 0 > /proc/sys/net/netfilter/nf_conntrack_sip_timeout 2>/dev/null || true
/etc/init.d/firewall restart
echo "[+] SIP ALG successfully disabled."` : ''}

## 2. Voice VLAN ${cfg.voiceVlanId} Interface Setup
uci set network.voice=interface
uci set network.voice.proto='static'
uci set network.voice.ipaddr='${subnetBase}'
uci set network.voice.netmask='255.255.255.0'
uci commit network
/etc/init.d/network reload

## 3. DHCP Option 66 & 150 for IP Phone Auto-Provisioning
uci set dhcp.voice=dhcp
uci set dhcp.voice.interface='voice'
uci set dhcp.voice.start='10'
uci set dhcp.voice.limit='230'
uci set dhcp.voice.leasetime='24h'
uci delete dhcp.voice.dhcp_option 2>/dev/null || true
uci add_list dhcp.voice.dhcp_option='66,"${cfg.dataHandlerUrl}/provision/"'
uci add_list dhcp.voice.dhcp_option='150,"${cfg.pbxServer}"'
uci add_list dhcp.voice.dhcp_option='6,1.1.1.1,8.8.8.8'
uci commit dhcp
/etc/init.d/dnsmasq restart
echo "[+] DHCP Voice scope with Option 66 created on ${ipPrefix}.0/24."

${enableQos ? `## 4. Quality of Service (QoS) & DSCP EF (46) Traffic Shaping
iptables -t mangle -A PREROUTING -p udp -m multiport --dports 5060,5061 -j DSCP --set-dscp-class CS3
iptables -t mangle -A PREROUTING -p udp --dport 10000:20000 -j DSCP --set-dscp-class EF
echo "[+] Voice traffic priority queues assigned (DSCP EF / CS3)."` : ''}

echo "[✓] Technicolor Gateway optimization complete for ${cfg.siteName}!"
`;
}

// 4. Cisco IOS / ISR Enterprise Gateways & Small Business RV Series
export function generateCiscoConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));
  const disableAlg = cfg.disableSipAlg !== false;
  const enableQos = cfg.enableQos !== false;

  return `! ==============================================================================
! CKM Handler Cisco IOS / ISR & RV-Series Gateway Provisioning Script
! Site: ${cfg.siteName} | Target Model: ${cfg.model || 'ISR 1100 / 4321 / 4451 / RV340'}
! Generated at: ${new Date().toISOString()}
! ==============================================================================
enable
configure terminal

${disableAlg ? `! 1. Disable Cisco SIP ALG (NAT SIP Application Layer Gateway)
! On Cisco IOS, the SIP ALG causes severe NAT register corruption with SIP PBXs.
no ip nat service sip udp port 5060
no ip nat service sip tcp port 5060
no ip nat service sip udp port 5061
no ip nat service sip tcp port 5061` : ''}

! 2. Voice VLAN Sub-Interface Configuration (802.1Q VLAN ${cfg.voiceVlanId})
interface GigabitEthernet0/0/1.${cfg.voiceVlanId}
 description CKM-VOICE-ISOLATED
 encapsulation dot1Q ${cfg.voiceVlanId}
 ip address ${subnetBase} 255.255.255.0
 no shutdown
exit

! 3. Dedicated Cisco DHCP Server with Option 66 & 150
ip dhcp excluded-address ${subnetBase} ${ipPrefix}.9
ip dhcp pool CKM_VOICE_POOL
 network ${ipPrefix}.0 255.255.255.0
 default-router ${subnetBase}
 dns-server 1.1.1.1 8.8.8.8
 ! Option 66: String URL for Yealink, Poly, Fanvil, Grandstream, Snom
 option 66 ascii "${cfg.dataHandlerUrl}/provision/"
 ! Option 150: Cisco proprietary TFTP server IP array
 option 150 ip ${cfg.pbxServer}
 lease 1
exit

${enableQos ? `! 4. Cisco Modular QoS CLI (MQC) - Voice Priority EF (DSCP 46)
class-map match-any CKM-VOICE-SIGNALING
 match ip dscp cs3
 match access-list 150
class-map match-any CKM-VOICE-AUDIO
 match ip dscp ef
 match access-list 151

policy-map CKM-WAN-EDGE-QOS
 class CKM-VOICE-AUDIO
  priority percent 30
 class CKM-VOICE-SIGNALING
  bandwidth percent 5
 class class-default
  fair-queue

access-list 150 permit udp any any range 5060 5061
access-list 151 permit udp any any range 10000 20000` : ''}

end
write memory
! [CKM Handler] Cisco Gateway configuration applied and saved to NVRAM.
`;
}

// 5. DrayTek Vigor Series (2860, 2862, 2865, 2866, 2925, 2926, 2927, 2962, 3910)
export function generateDraytekConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));
  const disableAlg = cfg.disableSipAlg !== false;
  const enableQos = cfg.enableQos !== false;

  return `// ==============================================================================
// CKM Handler DrayTek Vigor CLI Provisioning Script
// Site: ${cfg.siteName} | Target Model: DrayTek ${cfg.model || 'Vigor 2865 / 2927 / 3910'}
// Generated at: ${new Date().toISOString()}
// ==============================================================================

${disableAlg ? `// 1. Disable SIP ALG on DrayTek DrayOS:
sys sip_alg 0
// Verify: sys sip_alg ?` : ''}

// 2. Configure Dedicated Voice Subnet on LAN 2 (VLAN ${cfg.voiceVlanId})
vlan 2 enable
vlan 2 vid ${cfg.voiceVlanId}
srv dhcp 2 enable
srv dhcp 2 ip ${subnetBase}
srv dhcp 2 mask 255.255.255.0
srv dhcp 2 start ${ipPrefix}.10
srv dhcp 2 count 220
srv dhcp 2 gw ${subnetBase}
srv dhcp 2 dns1 1.1.1.1
srv dhcp 2 dns2 8.8.8.8

// 3. DHCP Option 66 for Auto-Provisioning:
srv dhcp 2 opt66 "${cfg.dataHandlerUrl}/provision/"

${enableQos ? `// 4. DrayTek Hardware QoS (Bandwidth Management)
ip bwm on
ip bwm qos on
ip bwm qos class 1 name VoIP-High-Priority
ip bwm qos rule add 1 proto 17 sport 5060:5061 dport 5060:5061
ip bwm qos rule add 1 proto 17 sport 10000:20000 dport 10000:20000
ip bwm qos class 1 reserve 20` : ''}

// Save & Apply:
sys reboot
`;
}

// 6. Ubiquiti EdgeRouter (EdgeOS / Vyatta)
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

# 1. Disable SIP ALG
set system conntrack modules sip disable

# 2. Configure Voice VLAN ${cfg.voiceVlanId}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} address ${cfg.voiceSubnet}
set interfaces ethernet eth1 vif ${cfg.voiceVlanId} description "CKM-VOICE"

# 3. Dedicated Voice DHCP Scope with Option 66
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 default-router ${subnetBase}
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 dns-server 1.1.1.1
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 dns-server 8.8.8.8
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 start ${ipPrefix}.10 stop ${ipPrefix}.240
set service dhcp-server shared-network-name VOICE-NET subnet ${ipPrefix}.0/24 tftp-server-name "${cfg.dataHandlerUrl}/provision/"

commit
save
exit
echo "[CKM Handler] Ubiquiti EdgeRouter configuration applied."
`;
}

// 7. Ubiquiti UniFi Gateway (UDM / UXG)
export function generateUniFiConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Ubiquiti UniFi OS Provisioning Profile
# Site: ${cfg.siteName} | Target: UniFi ${cfg.model || 'UDM / UXG'}
# ==============================================================================

1. Disable SIP ALG in UniFi Network Console:
   - Settings > Security > General
   - Conntrack Modules > Uncheck: [ ] SIP
   - Click "Apply Changes"

2. Create Isolated Voice VLAN:
   - Settings > Networks > New Virtual Network
   - Name: CKM-Voice
   - VLAN ID: ${cfg.voiceVlanId}
   - Gateway IP/Subnet: ${cfg.voiceSubnet}
   - Auto Scale Network: Manual

3. Option 66 Handset Auto-Provisioning:
   - In CKM-Voice Network settings > DHCP Service
   - DHCP Option 66 (TFTP / Server):
     * Value: ${cfg.dataHandlerUrl}/provision/
`;
}

// 8. pfSense Firewall
export function generatePfSenseConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler pfSense Firewall Configuration Guide
# Site: ${cfg.siteName} | Target: pfSense Plus / CE (${cfg.model || 'Netgate'})
# ==============================================================================

1. Set Static Port NAT (CRITICAL for VoIP):
   - Navigate to: Firewall > NAT > Outbound
   - Select: "Hybrid Outbound NAT rule generation"
   - Add Mappings:
     * Interface: WAN
     * Source: Network (Voice VLAN ${cfg.voiceVlanId}: ${cfg.voiceSubnet})
     * Destination: Any
     * Translation: Interface address
     * Check: [x] Static Port (Do NOT randomize source port)

2. Disable SIP ALG:
   - System > Advanced > Firewall & NAT
   - Disable Firewall Scrub: [x] Disables the filter scrub function
`;
}

// 9. OPNsense Firewall
export function generateOpnSenseConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler OPNsense Firewall Configuration Guide
# Site: ${cfg.siteName} | Target: OPNsense Business / Community
# ==============================================================================

1. Outbound Static Port NAT:
   - Firewall > NAT > Outbound
   - Switch to "Hybrid outbound NAT rule generation"
   - Add rule for Voice VLAN:
     * Destination: Any
     * Translation / Target: Interface address
     * Check: [x] Static-port
`;
}

// 10. Cisco Catalyst Switch
export function generateCiscoSwitchConfig(cfg: RouterConfigParams): string {
  return `! ==============================================================================
! CKM Handler Cisco Catalyst Switch Configuration
! Model: ${cfg.model || 'Catalyst 2960 / 3650 / 9200 / 9300'}
! ==============================================================================
enable
configure terminal

vlan ${cfg.voiceVlanId}
 name CKM-VOICE
exit

interface range GigabitEthernet1/0/1 - 24
 switchport mode access
 switchport access vlan 10
 switchport voice vlan ${cfg.voiceVlanId}
 spanning-tree portfast
end
write memory
`;
}

// 11. Cisco Meraki MX
export function generateMerakiConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Cisco Meraki MX Configuration Guide
# Model: Meraki ${cfg.model || 'MX67 / MX68 / MX85 / MX95'}
# ==============================================================================

1. Security & SD-WAN > Addressing & VLANs:
   - Routing: Enabled
   - Subnets > Add VLAN:
     * Name: Voice
     * Subnet: ${cfg.voiceSubnet}
     * MX IP: ${cfg.voiceSubnet.split('/')[0]}
     * VLAN ID: ${cfg.voiceVlanId}

2. DHCP Custom Option 66:
   - Option: 66, Type: Text, Value: "${cfg.dataHandlerUrl}/provision/"
`;
}

// 12. Fortinet FortiGate
export function generateFortiGateConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Fortinet FortiOS Script
# Model: FortiGate ${cfg.model || '40F / 60F / 70F / 100F'}
# ==============================================================================
config system session-helper
    show
    # Delete SIP helper entry (typically 12 or 13)
    delete 13
end

config voip profile
    edit "default"
        config sip
            set status disable
        end
    next
end
`;
}

// 13. SonicWall
export function generateSonicWallConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler SonicWall TZ & NSA Configuration Guide
# Model: SonicWall ${cfg.model || 'TZ270 / TZ370 / TZ470 / NSA 2700'}
# ==============================================================================

1. VoIP > Settings:
   - Uncheck: [ ] Enable SIP Transformations (SIP ALG)
   - Uncheck: [ ] Enable H.323 Transformations
`;
}

// 14. Sophos XGS
export function generateSophosConfig(cfg: RouterConfigParams): string {
  return `# ==============================================================================
# CKM Handler Sophos XGS Console Guide
# Model: Sophos XGS ${cfg.model || '87 / 107 / 116 / 126'}
# ==============================================================================

console> system system_modules sip unload
console> system system_modules show
`;
}

// 15. Generic Linux / Dnsmasq
export function generateDnsmasqConfig(cfg: RouterConfigParams): string {
  const subnetBase = cfg.voiceSubnet.split('/')[0];
  const ipPrefix = subnetBase.substring(0, subnetBase.lastIndexOf('.'));

  return `# ==============================================================================
# CKM Handler Linux dnsmasq VoIP Script
# ==============================================================================
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

// Master Dispatcher (supports both generateRouterConfig(params) and generateRouterConfig(brandId, params))
export function generateRouterConfig(
  brandOrCfg: string | RouterConfigParams,
  maybeCfg?: RouterConfigParams
): { filename: string; mimeType: string; content: string } {
  let brandId: string;
  let cfg: RouterConfigParams;

  if (typeof brandOrCfg === 'string') {
    brandId = brandOrCfg;
    cfg = maybeCfg || {
      siteName: 'Default',
      brand: brandId,
      voiceVlanId: 20,
      voiceSubnet: '10.20.0.1/24',
      pbxServer: 'pbx.chriskendall.media',
      dataHandlerUrl: 'https://handler.chriskendall.media'
    };
  } else {
    cfg = brandOrCfg;
    brandId = cfg.brand || '';
  }

  const b = (brandId || cfg.brand || '').toLowerCase();
  const safeSite = (cfg.siteName || 'site').toLowerCase().replace(/[^a-z0-9]/g, '-');

  let filename = `ckm-router-${safeSite}.txt`;
  let mimeType = 'text/plain';
  let content = '';

  if (b.includes('technicolor') || b.includes('thomson')) {
    filename = `ckm-technicolor-${safeSite}.sh`;
    mimeType = 'text/x-shellscript';
    content = generateTechnicolorConfig(cfg);
  } else if (b.includes('tplink') || b.includes('tp-link') || b.includes('omada') || b.includes('archer')) {
    filename = `ckm-tplink-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateTpLinkConfig(cfg);
  } else if (b.includes('switch') || b.includes('catalyst-switch')) {
    filename = `ckm-catalyst-switch-${safeSite}.cfg`;
    mimeType = 'text/plain';
    content = generateCiscoSwitchConfig(cfg);
  } else if (b.includes('cisco') || b.includes('ios') || b.includes('isr')) {
    filename = `ckm-cisco-${safeSite}.cfg`;
    mimeType = 'text/plain';
    content = generateCiscoConfig(cfg);
  } else if (b.includes('draytek') || b.includes('vigor')) {
    filename = `ckm-draytek-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateDraytekConfig(cfg);
  } else if (b.includes('ubiquiti') || b.includes('edgerouter')) {
    filename = `ckm-ubiquiti-${safeSite}.sh`;
    mimeType = 'text/x-shellscript';
    content = generateUbiquitiConfig(cfg);
  } else if (b.includes('unifi')) {
    filename = `ckm-unifi-${safeSite}.sh`;
    mimeType = 'text/x-shellscript';
    content = generateUniFiConfig(cfg);
  } else if (b.includes('pfsense') || b.includes('netgate')) {
    filename = `ckm-pfsense-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generatePfSenseConfig(cfg);
  } else if (b.includes('opnsense') || b.includes('deciso')) {
    filename = `ckm-opnsense-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateOpnSenseConfig(cfg);
  } else if (b.includes('meraki')) {
    filename = `ckm-meraki-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateMerakiConfig(cfg);
  } else if (b.includes('fortinet') || b.includes('fortigate')) {
    filename = `ckm-fortigate-${safeSite}.conf`;
    mimeType = 'text/plain';
    content = generateFortiGateConfig(cfg);
  } else if (b.includes('sonicwall')) {
    filename = `ckm-sonicwall-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateSonicWallConfig(cfg);
  } else if (b.includes('sophos')) {
    filename = `ckm-sophos-${safeSite}.txt`;
    mimeType = 'text/plain';
    content = generateSophosConfig(cfg);
  } else if (b.includes('linux') || b.includes('dnsmasq')) {
    filename = `ckm-linux-${safeSite}.sh`;
    mimeType = 'text/x-shellscript';
    content = generateDnsmasqConfig(cfg);
  } else {
    filename = `ckm-mikrotik-${safeSite}.rsc`;
    mimeType = 'text/plain';
    content = generateMikroTikConfig(cfg);
  }

  return { filename, mimeType, content };
}
