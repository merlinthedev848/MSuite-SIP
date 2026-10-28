import { HandsetAccountConfig, generateYealinkConfig } from './yealink';
import { generateFanvilConfig } from './fanvil';
import { generateGrandstreamConfig } from './grandstream';
import { generatePolyConfig } from './poly';
import { generateCiscoPhoneConfig } from './ciscoPhone';
import { generateSnomConfig } from './snom';
import { generateGigasetConfig } from './gigaset';
import { RouterConfigParams, generateRouterConfig } from './routerTemplates';

export interface DeviceBrandMeta {
  id: string;
  name: string;
  configExt: string;
  models: Array<{ id: string; name: string; series?: string }>;
}

export const HANDSET_CATALOG: DeviceBrandMeta[] = [
  {
    id: 'yealink',
    name: 'Yealink (CFG)',
    configExt: '.cfg',
    models: [
      { id: 'T30P', name: 'Yealink T30P', series: 'T3 Entry Series' },
      { id: 'T31P', name: 'Yealink T31P', series: 'T3 Entry Series' },
      { id: 'T31G', name: 'Yealink T31G (Gigabit)', series: 'T3 Entry Series' },
      { id: 'T33G', name: 'Yealink T33G (Color Display)', series: 'T3 Entry Series' },
      { id: 'T41S', name: 'Yealink T41S', series: 'T4 Business Series' },
      { id: 'T42S', name: 'Yealink T42S', series: 'T4 Business Series' },
      { id: 'T42U', name: 'Yealink T42U (Dual USB)', series: 'T4 Business Series' },
      { id: 'T43U', name: 'Yealink T43U', series: 'T4 Business Series' },
      { id: 'T46S', name: 'Yealink T46S (Color Display)', series: 'T4 Executive Series' },
      { id: 'T46U', name: 'Yealink T46U (Dual USB Gigabit)', series: 'T4 Executive Series' },
      { id: 'T48S', name: 'Yealink T48S (7" Touchscreen)', series: 'T4 Touch Series' },
      { id: 'T48U', name: 'Yealink T48U (7" Touch Gigabit)', series: 'T4 Touch Series' },
      { id: 'T53', name: 'Yealink T53', series: 'T5 Prime Series' },
      { id: 'T53W', name: 'Yealink T53W (Built-in Wi-Fi & BT)', series: 'T5 Prime Series' },
      { id: 'T54W', name: 'Yealink T54W (Color Wi-Fi & BT)', series: 'T5 Prime Series' },
      { id: 'T57W', name: 'Yealink T57W (7" Touch Wi-Fi)', series: 'T5 Prime Series' },
      { id: 'T58W', name: 'Yealink T58W (Android Video Capable)', series: 'T5 Smart Series' },
      { id: 'W56P', name: 'Yealink W56P (DECT Cordless Base+Handset)', series: 'DECT Cordless' },
      { id: 'W60B', name: 'Yealink W60B (DECT Base Station)', series: 'DECT Cordless' },
      { id: 'W70B', name: 'Yealink W70B (High-Performance DECT Base)', series: 'DECT Cordless' },
      { id: 'W73P', name: 'Yealink W73P (Compact Modern DECT)', series: 'DECT Cordless' },
      { id: 'W76P', name: 'Yealink W76P (Ruggedized DECT Cordless)', series: 'DECT Cordless' },
      { id: 'CP920', name: 'Yealink CP920 (Touch Conference Phone)', series: 'Conference' },
      { id: 'CP935W', name: 'Yealink CP935W (Wireless Conference)', series: 'Conference' },
      { id: 'CP960', name: 'Yealink CP960 (Enterprise Android Conference)', series: 'Conference' }
    ]
  },
  {
    id: 'grandstream',
    name: 'Grandstream (XML)',
    configExt: '.xml',
    models: [
      { id: 'GXP1610', name: 'Grandstream GXP1610 / 1615', series: 'GXP Essential' },
      { id: 'GXP1625', name: 'Grandstream GXP1625 (HD Audio)', series: 'GXP Essential' },
      { id: 'GXP2130', name: 'Grandstream GXP2130 (Color Gigabit)', series: 'GXP Enterprise' },
      { id: 'GXP2135', name: 'Grandstream GXP2135 (32 Digital BLF)', series: 'GXP Enterprise' },
      { id: 'GXP2140', name: 'Grandstream GXP2140 (Executive 4-Line)', series: 'GXP Enterprise' },
      { id: 'GXP2160', name: 'Grandstream GXP2160 (6-Line 24 BLF Keys)', series: 'GXP Enterprise' },
      { id: 'GXP2170', name: 'Grandstream GXP2170 (12-Line 48 BLF)', series: 'GXP Enterprise' },
      { id: 'GRP2601', name: 'Grandstream GRP2601 / 2601P', series: 'GRP Carrier-Grade' },
      { id: 'GRP2602', name: 'Grandstream GRP2602 / 2602P / 2602W (Wi-Fi)', series: 'GRP Carrier-Grade' },
      { id: 'GRP2612', name: 'Grandstream GRP2612 / 2612W (Color LCD)', series: 'GRP Carrier-Grade' },
      { id: 'GRP2614', name: 'Grandstream GRP2614 (Dual LCD Screens)', series: 'GRP Carrier-Grade' },
      { id: 'GRP2615', name: 'Grandstream GRP2615 (10-Line Color Wi-Fi)', series: 'GRP Carrier-Grade' },
      { id: 'GRP2616', name: 'Grandstream GRP2616 (Flagship Dual Screen)', series: 'GRP Carrier-Grade' },
      { id: 'WP810', name: 'Grandstream WP810 (Dual-Band Wi-Fi Handset)', series: 'Cordless Wi-Fi' },
      { id: 'WP820', name: 'Grandstream WP820 (Enterprise Wi-Fi Handset)', series: 'Cordless Wi-Fi' },
      { id: 'WP825', name: 'Grandstream WP825 (Ruggedized Wi-Fi Cordless)', series: 'Cordless Wi-Fi' },
      { id: 'GXV3370', name: 'Grandstream GXV3370 (7" Android Touch Video)', series: 'Smart Video' },
      { id: 'DP750', name: 'Grandstream DP750 / DP720 (DECT Base Station)', series: 'DECT Cordless' },
      { id: 'DP752', name: 'Grandstream DP752 / DP730 (Long-Range DECT)', series: 'DECT Cordless' }
    ]
  },
  {
    id: 'fanvil',
    name: 'Fanvil (XML)',
    configExt: '.xml',
    models: [
      { id: 'X1S', name: 'Fanvil X1S / X1SG (Entry Gigabit)', series: 'X Series' },
      { id: 'X3S', name: 'Fanvil X3S / X3SP / X3SG (Color Display)', series: 'X Series' },
      { id: 'X3U', name: 'Fanvil X3U (Pro Gigabit Color)', series: 'X-U Series' },
      { id: 'X4U', name: 'Fanvil X4U (Dual Color Screens 12 DSS)', series: 'X-U Series' },
      { id: 'X5U', name: 'Fanvil X5U (Dual Color Screens 30 DSS)', series: 'X-U Series' },
      { id: 'X6U', name: 'Fanvil X6U (Triple Color Screens 60 DSS)', series: 'X-U Series' },
      { id: 'X7', name: 'Fanvil X7 (7" Touchscreen 127 DSS)', series: 'X Touch Series' },
      { id: 'X7C', name: 'Fanvil X7C (5" Color Screen 60 DSS)', series: 'X Touch Series' },
      { id: 'X210', name: 'Fanvil X210 (Enterprise 106 DSS Keys)', series: 'Executive' },
      { id: 'V62', name: 'Fanvil V62 (Prime Series Gigabit)', series: 'V Prime Series' },
      { id: 'V64', name: 'Fanvil V64 (Prime Color Wi-Fi & BT)', series: 'V Prime Series' },
      { id: 'V65', name: 'Fanvil V65 (Flagship Smart Screen)', series: 'V Prime Series' },
      { id: 'H2U', name: 'Fanvil H2U (Compact Wall/Hotel Phone)', series: 'H Hotel Series' },
      { id: 'H3', name: 'Fanvil H3 (Hotel Guestroom Phone)', series: 'H Hotel Series' },
      { id: 'H5', name: 'Fanvil H5 (Color Screen Hotel Phone)', series: 'H Hotel Series' },
      { id: 'PA2', name: 'Fanvil PA2 / PA3 (SIP Paging & Intercom Gateway)', series: 'Intercom' }
    ]
  },
  {
    id: 'poly',
    name: 'Poly / Polycom (CFG / XML)',
    configExt: '.cfg',
    models: [
      { id: 'VVX150', name: 'Poly VVX 150 (2-Line Entry)', series: 'VVX x50 Series' },
      { id: 'VVX250', name: 'Poly VVX 250 (4-Line Color Gigabit)', series: 'VVX x50 Series' },
      { id: 'VVX350', name: 'Poly VVX 350 (6-Line Color Gigabit)', series: 'VVX x50 Series' },
      { id: 'VVX450', name: 'Poly VVX 450 (12-Line Executive Color)', series: 'VVX x50 Series' },
      { id: 'VVX300', name: 'Polycom VVX 300 / 310 (6-Line Classic)', series: 'VVX Classic' },
      { id: 'VVX400', name: 'Polycom VVX 400 / 410 (Color Business)', series: 'VVX Classic' },
      { id: 'VVX500', name: 'Polycom VVX 500 (Touchscreen Media Phone)', series: 'VVX Media' },
      { id: 'VVX600', name: 'Polycom VVX 600 (Executive Touchscreen)', series: 'VVX Media' },
      { id: 'IP331', name: 'Polycom SoundPoint IP 331 / 335', series: 'SoundPoint IP' },
      { id: 'IP550', name: 'Polycom SoundPoint IP 550 / 650', series: 'SoundPoint IP' },
      { id: 'Trio8300', name: 'Poly Trio 8300 (Conference Phone)', series: 'Trio Conference' },
      { id: 'Trio8500', name: 'Poly Trio 8500 (Conference System)', series: 'Trio Conference' },
      { id: 'Trio8800', name: 'Poly Trio 8800 (Smart Conference System)', series: 'Trio Conference' },
      { id: 'CCX400', name: 'Poly CCX 400 (Touchscreen Open SIP)', series: 'CCX Series' },
      { id: 'CCX500', name: 'Poly CCX 500 (Executive Touchscreen)', series: 'CCX Series' }
    ]
  },
  {
    id: 'cisco',
    name: 'Cisco / Linksys (SPA & MPP XML)',
    configExt: '.cfg',
    models: [
      { id: 'SPA303', name: 'Cisco SPA303 (3-Line Basic)', series: 'SPA Series' },
      { id: 'SPA502G', name: 'Cisco SPA502G (1-Line Business)', series: 'SPA Series' },
      { id: 'SPA504G', name: 'Cisco SPA504G (4-Line IP Phone)', series: 'SPA Series' },
      { id: 'SPA508G', name: 'Cisco SPA508G (8-Line IP Phone)', series: 'SPA Series' },
      { id: 'SPA525G', name: 'Cisco SPA525G2 (5-Line Color Wi-Fi)', series: 'SPA Series' },
      { id: 'CP-6821', name: 'Cisco 6821 MPP (Multiplatform Firmware)', series: '6800 MPP' },
      { id: 'CP-7821', name: 'Cisco 7821 MPP (2-Line Multiplatform)', series: '7800 MPP' },
      { id: 'CP-7841', name: 'Cisco 7841 MPP (4-Line Gigabit Multiplatform)', series: '7800 MPP' },
      { id: 'CP-8841', name: 'Cisco 8841 MPP (Color Gigabit Multiplatform)', series: '8800 MPP' },
      { id: 'CP-8851', name: 'Cisco 8851 MPP (Executive Color USB Multiplatform)', series: '8800 MPP' },
      { id: 'CP-8861', name: 'Cisco 8861 MPP (Wi-Fi BT Gigabit Multiplatform)', series: '8800 MPP' }
    ]
  },
  {
    id: 'snom',
    name: 'Snom (XML)',
    configExt: '.xml',
    models: [
      { id: 'D712', name: 'Snom D712 (Classic 4-Line)', series: 'D7 Series' },
      { id: 'D713', name: 'Snom D713 (Color Gigabit)', series: 'D7 Series' },
      { id: 'D717', name: 'Snom D717 (Color USB Gigabit)', series: 'D7 Series' },
      { id: 'D735', name: 'Snom D735 (Color Sensor 32 Smart BLF)', series: 'D7 Series' },
      { id: 'D785', name: 'Snom D785 (Flagship Dual Display BT)', series: 'D7 Series' },
      { id: 'D385', name: 'Snom D385 (Dual Display Executive)', series: 'D3 Series' },
      { id: 'M300', name: 'Snom M300 (DECT Base Station)', series: 'M DECT Series' },
      { id: 'M400', name: 'Snom M400 (Modern Dual-Cell DECT Base)', series: 'M DECT Series' },
      { id: 'M900', name: 'Snom M900 (Multi-Cell DECT Enterprise Base)', series: 'M DECT Series' }
    ]
  },
  {
    id: 'gigaset',
    name: 'Gigaset pro (XML)',
    configExt: '.xml',
    models: [
      { id: 'Maxwell-2', name: 'Gigaset Maxwell 2 (High-Definition Desktop)', series: 'Maxwell Series' },
      { id: 'Maxwell-3', name: 'Gigaset Maxwell 3 (Color Gigabit Desktop)', series: 'Maxwell Series' },
      { id: 'Maxwell-4', name: 'Gigaset Maxwell 4 (4.3" Touchscreen Desktop)', series: 'Maxwell Series' },
      { id: 'N510', name: 'Gigaset N510 IP Pro (Single-Cell DECT Base)', series: 'DECT IP Pro' },
      { id: 'N670', name: 'Gigaset N670 IP Pro (Single/Multi-Cell DECT Base)', series: 'DECT IP Pro' },
      { id: 'N870', name: 'Gigaset N870 IP Pro (Enterprise Multi-Cell DECT)', series: 'DECT IP Pro' }
    ]
  }
];

export const ROUTER_CATALOG: DeviceBrandMeta[] = [
  {
    id: 'mikrotik',
    name: 'MikroTik RouterOS (v6/v7 .rsc)',
    configExt: '.rsc',
    models: [
      { id: 'hex', name: 'MikroTik hEX (RB750Gr3 / RB760iGS)', series: 'Small Branch' },
      { id: 'rb3011', name: 'MikroTik RB3011UiAS-RM (10-Port Gigabit)', series: 'Mid-Market' },
      { id: 'rb4011', name: 'MikroTik RB4011iGS+ (Quad-Core 10G SFP+)', series: 'Enterprise' },
      { id: 'rb5009', name: 'MikroTik RB5009UG+S+IN (Heavy Duty 2.5G)', series: 'Enterprise' },
      { id: 'ccr2004', name: 'MikroTik CCR2004-16G-2S+ (Cloud Core)', series: 'Data Center' },
      { id: 'ccr2116', name: 'MikroTik CCR2116-12G-4S+ (16-Core Carrier)', series: 'Data Center' },
      { id: 'hap-ax3', name: 'MikroTik hAP ax3 / ax2 (Wi-Fi 6 VoIP Gateway)', series: 'Wireless Branch' }
    ]
  },
  {
    id: 'ubiquiti',
    name: 'Ubiquiti EdgeRouter (EdgeOS .sh)',
    configExt: '.sh',
    models: [
      { id: 'er-x', name: 'Ubiquiti EdgeRouter X (ER-X / SFP)', series: 'EdgeRouter' },
      { id: 'er-4', name: 'Ubiquiti EdgeRouter 4 (ER-4)', series: 'EdgeRouter' },
      { id: 'er-6p', name: 'Ubiquiti EdgeRouter 6P (ER-6P PoE)', series: 'EdgeRouter' },
      { id: 'er-12', name: 'Ubiquiti EdgeRouter 12 (ER-12 10-Port)', series: 'EdgeRouter' },
      { id: 'er-8-xg', name: 'Ubiquiti EdgeRouter Infinity (ER-8-XG 10G)', series: 'EdgeRouter Carrier' }
    ]
  },
  {
    id: 'unifi',
    name: 'Ubiquiti UniFi Gateway (UDM / UXG)',
    configExt: '.sh',
    models: [
      { id: 'udm-pro', name: 'UniFi Dream Machine Pro (UDM-Pro)', series: 'UniFi Gateway' },
      { id: 'udm-se', name: 'UniFi Dream Machine Special Edition (UDM-SE)', series: 'UniFi Gateway' },
      { id: 'uxg-pro', name: 'UniFi Next-Generation Gateway Pro (UXG-Pro)', series: 'UniFi Gateway' },
      { id: 'uxg-lite', name: 'UniFi Next-Generation Gateway Lite (UXG-Lite)', series: 'UniFi Gateway' },
      { id: 'ucg-ultra', name: 'UniFi Cloud Gateway Ultra (UCG-Ultra)', series: 'UniFi Gateway' }
    ]
  },
  {
    id: 'pfsense',
    name: 'pfSense / Netgate (Static Port & HFSC QoS)',
    configExt: '.txt',
    models: [
      { id: 'netgate-1100', name: 'Netgate 1100 (SOHO Desktop)', series: 'Netgate Appliance' },
      { id: 'netgate-2100', name: 'Netgate 2100 (Branch Office)', series: 'Netgate Appliance' },
      { id: 'netgate-4100', name: 'Netgate 4100 (Enterprise Desktop)', series: 'Netgate Appliance' },
      { id: 'netgate-6100', name: 'Netgate 6100 (Multi-Gig / 10G SFP+)', series: 'Netgate Appliance' },
      { id: 'netgate-8200', name: 'Netgate 8200 (Rackmount Enterprise)', series: 'Netgate Appliance' },
      { id: 'pfsense-custom', name: 'pfSense Plus / Community Edition (Custom Hardware)', series: 'x86 Architecture' }
    ]
  },
  {
    id: 'opnsense',
    name: 'OPNsense Firewall (Static Port NAT)',
    configExt: '.txt',
    models: [
      { id: 'dec600', name: 'Deciso DEC600 Series', series: 'Deciso Hardware' },
      { id: 'dec700', name: 'Deciso DEC700 Series (Desktop SFP+)', series: 'Deciso Hardware' },
      { id: 'dec800', name: 'Deciso DEC800 Series', series: 'Deciso Hardware' },
      { id: 'dec2600', name: 'Deciso DEC2600 Series (1U Rackmount)', series: 'Deciso Hardware' },
      { id: 'opnsense-custom', name: 'OPNsense Business / Community (Custom Appliance)', series: 'x86 Architecture' }
    ]
  },
  {
    id: 'cisco',
    name: 'Cisco IOS & ISR Gateway (.cfg)',
    configExt: '.cfg',
    models: [
      { id: 'isr-1100', name: 'Cisco ISR 1100 (1100-4P / 1100-8P)', series: 'ISR 1000' },
      { id: 'isr-4321', name: 'Cisco ISR 4321 (Modular Enterprise Router)', series: 'ISR 4000' },
      { id: 'isr-4331', name: 'Cisco ISR 4331 (Voice Gateway Ready)', series: 'ISR 4000' },
      { id: 'isr-4451', name: 'Cisco ISR 4451-X (High-Performance Branch)', series: 'ISR 4000' },
      { id: 'c8200', name: 'Cisco Catalyst 8200 Edge Platform', series: 'Catalyst 8000' },
      { id: 'c8300', name: 'Cisco Catalyst 8300 Edge Platform', series: 'Catalyst 8000' }
    ]
  },
  {
    id: 'switch',
    name: 'Cisco Catalyst Switch (Voice VLAN .cfg)',
    configExt: '.cfg',
    models: [
      { id: 'c2960x', name: 'Cisco Catalyst 2960-X / 2960-XR (24/48 PoE+)', series: 'Catalyst Access' },
      { id: 'c3560cx', name: 'Cisco Catalyst 3560-CX (Compact Gigabit PoE)', series: 'Catalyst Compact' },
      { id: 'c3650', name: 'Cisco Catalyst 3650 / 3850 (Multi-Gigabit PoE)', series: 'Catalyst Campus' },
      { id: 'c9200', name: 'Cisco Catalyst 9200 / 9200L (Enterprise Access)', series: 'Catalyst 9000' },
      { id: 'c9300', name: 'Cisco Catalyst 9300 (Stackable Enterprise)', series: 'Catalyst 9000' }
    ]
  },
  {
    id: 'meraki',
    name: 'Cisco Meraki MX Security Appliance',
    configExt: '.txt',
    models: [
      { id: 'mx67', name: 'Cisco Meraki MX67 / MX67W (Branch Gateway)', series: 'Meraki Small Branch' },
      { id: 'mx68', name: 'Cisco Meraki MX68 / MX68W / MX68CW', series: 'Meraki Branch PoE' },
      { id: 'mx85', name: 'Cisco Meraki MX85 (Gigabit Mid-Market)', series: 'Meraki Enterprise' },
      { id: 'mx95', name: 'Cisco Meraki MX95 (Multi-Gigabit 10G)', series: 'Meraki Enterprise' },
      { id: 'mx105', name: 'Cisco Meraki MX105 (High-Throughput Campus)', series: 'Meraki Campus' }
    ]
  },
  {
    id: 'draytek',
    name: 'DrayTek Vigor Series',
    configExt: '.txt',
    models: [
      { id: 'vigor-2865', name: 'DrayTek Vigor 2865 / 2865ac (VDSL / GbE)', series: 'Vigor 2860 Series' },
      { id: 'vigor-2866', name: 'DrayTek Vigor 2866 / 2866Lac (G.Fast / LTE)', series: 'Vigor 2860 Series' },
      { id: 'vigor-2927', name: 'DrayTek Vigor 2927 / 2927ac (Dual-WAN GbE)', series: 'Vigor 2920 Series' },
      { id: 'vigor-2962', name: 'DrayTek Vigor 2962 (2.5G Multi-WAN)', series: 'Vigor High-Speed' },
      { id: 'vigor-3910', name: 'DrayTek Vigor 3910 (10G Multi-WAN Enterprise)', series: 'Vigor Enterprise' }
    ]
  },
  {
    id: 'fortinet',
    name: 'Fortinet FortiGate (FortiOS)',
    configExt: '.conf',
    models: [
      { id: 'fg-40f', name: 'Fortinet FortiGate 40F (Entry Branch)', series: 'FortiGate F-Series' },
      { id: 'fg-60f', name: 'Fortinet FortiGate 60F (SMB Gateway)', series: 'FortiGate F-Series' },
      { id: 'fg-70f', name: 'Fortinet FortiGate 70F (Branch Office)', series: 'FortiGate F-Series' },
      { id: 'fg-80f', name: 'Fortinet FortiGate 80F (Dual Power Branch)', series: 'FortiGate F-Series' },
      { id: 'fg-100f', name: 'Fortinet FortiGate 100F (Mid-Market 10G SFP+)', series: 'FortiGate F-Series' }
    ]
  },
  {
    id: 'sonicwall',
    name: 'SonicWall TZ & NSA Series',
    configExt: '.txt',
    models: [
      { id: 'tz270', name: 'SonicWall TZ270 / TZ270W (Entry SOHO)', series: 'TZ Series Gen 7' },
      { id: 'tz370', name: 'SonicWall TZ370 / TZ370W (Branch Office)', series: 'TZ Series Gen 7' },
      { id: 'tz470', name: 'SonicWall TZ470 / TZ470W (Multi-Gigabit Branch)', series: 'TZ Series Gen 7' },
      { id: 'tz570', name: 'SonicWall TZ570 / TZ570W (5GbE SFP+ Branch)', series: 'TZ Series Gen 7' },
      { id: 'tz670', name: 'SonicWall TZ670 (10GbE High-Performance)', series: 'TZ Series Gen 7' },
      { id: 'nsa2700', name: 'SonicWall NSA 2700 (Enterprise Mid-Market)', series: 'NSA Series Gen 7' }
    ]
  },
  {
    id: 'sophos',
    name: 'Sophos XGS Firewall',
    configExt: '.txt',
    models: [
      { id: 'xgs-87', name: 'Sophos XGS 87 / 87w (Small Office)', series: 'XGS Series' },
      { id: 'xgs-107', name: 'Sophos XGS 107 / 107w (Branch Office)', series: 'XGS Series' },
      { id: 'xgs-116', name: 'Sophos XGS 116 / 116w (GbE & SFP)', series: 'XGS Series' },
      { id: 'xgs-126', name: 'Sophos XGS 126 / 126w (Multi-Port Branch)', series: 'XGS Series' },
      { id: 'xgs-136', name: 'Sophos XGS 136 / 136w (Dual SFP+ 2.5G)', series: 'XGS Series' }
    ]
  },
  {
    id: 'omada',
    name: 'TP-Link Omada SDN Gateway',
    configExt: '.txt',
    models: [
      { id: 'er605', name: 'TP-Link Omada ER605 (TL-R605 Gigabit VPN)', series: 'Omada Gigabit' },
      { id: 'er7206', name: 'TP-Link Omada ER7206 (TL-ER7206 SFP Gigabit)', series: 'Omada Enterprise' },
      { id: 'er707-m2', name: 'TP-Link Omada ER707-M2 (Multi-Gigabit 2.5G)', series: 'Omada Multi-Gig' },
      { id: 'er8411', name: 'TP-Link Omada ER8411 (Enterprise 10G SFP+)', series: 'Omada 10G' }
    ]
  },
  {
    id: 'linux',
    name: 'Generic Linux / Dnsmasq (Option 66)',
    configExt: '.sh',
    models: [
      { id: 'dnsmasq', name: 'Debian / Ubuntu / AlmaLinux dnsmasq Server', series: 'Linux Gateway' },
      { id: 'isc-dhcp', name: 'ISC DHCP Server (dhcpd.conf)', series: 'Linux Gateway' },
      { id: 'kea-dhcp', name: 'ISC Kea Modern DHCP Server (kea-dhcp4.json)', series: 'Linux Gateway' }
    ]
  }
];

export function generateDefaultHandsetConfig(brand: string, cfg: HandsetAccountConfig): string {
  const b = (brand || '').toLowerCase();
  if (b === 'grandstream') return generateGrandstreamConfig(cfg);
  if (b === 'fanvil') return generateFanvilConfig(cfg);
  if (b === 'poly' || b === 'polycom') return generatePolyConfig(cfg);
  if (b === 'cisco' || b === 'linksys') return generateCiscoPhoneConfig(cfg);
  if (b === 'snom') return generateSnomConfig(cfg);
  if (b === 'gigaset') return generateGigasetConfig(cfg);
  return generateYealinkConfig(cfg);
}
