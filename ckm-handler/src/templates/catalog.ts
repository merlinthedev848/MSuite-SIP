import { HandsetAccountConfig, generateYealinkConfig } from './yealink';
import { generateFanvilConfig } from './fanvil';
import { generateGrandstreamConfig } from './grandstream';
import { generatePolyConfig } from './poly';
import { generateCiscoPhoneConfig } from './ciscoPhone';
import { generateSnomConfig } from './snom';
import { generateGigasetConfig } from './gigaset';
import { RouterConfigParams, generateRouterConfig } from './routerTemplates';

export interface DeviceModelMeta {
  id: string;
  name: string;
  series: string;
  firmwareVersion: string;
  firmwareUrl: string;
  firmwareFilename: string;
  firmwareNotes?: string;
}

export interface DeviceBrandMeta {
  id: string;
  name: string;
  configExt: string;
  vendorDocUrl?: string;
  models: DeviceModelMeta[];
}

export const HANDSET_CATALOG: DeviceBrandMeta[] = [
  {
    id: 'yealink',
    name: 'Yealink (CFG)',
    configExt: '.cfg',
    vendorDocUrl: 'https://support.yealink.com/',
    models: [
      { id: 'T30P', name: 'Yealink T30P', series: 'T3 Entry Series', firmwareVersion: '124.86.0.40', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=9c5c7dbfa1766a50', firmwareFilename: 'T30P-124.86.0.40.rom', firmwareNotes: 'TLS 1.3, Opus HD, Enhanced BLF' },
      { id: 'T31P', name: 'Yealink T31P', series: 'T3 Entry Series', firmwareVersion: '124.86.0.40', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=9c5c7dbfa1766a50', firmwareFilename: 'T31P-124.86.0.40.rom' },
      { id: 'T31G', name: 'Yealink T31G (Gigabit)', series: 'T3 Entry Series', firmwareVersion: '124.86.0.40', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=9c5c7dbfa1766a50', firmwareFilename: 'T31G-124.86.0.40.rom' },
      { id: 'T33G', name: 'Yealink T33G (Color Display)', series: 'T3 Entry Series', firmwareVersion: '124.86.0.40', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=9c5c7dbfa1766a50', firmwareFilename: 'T33G-124.86.0.40.rom' },
      { id: 'T41S', name: 'Yealink T41S', series: 'T4 Business Series', firmwareVersion: '66.86.0.15', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=6b82542a78b4a2bf', firmwareFilename: 'T41S-66.86.0.15.rom' },
      { id: 'T42S', name: 'Yealink T42S', series: 'T4 Business Series', firmwareVersion: '66.86.0.15', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=6b82542a78b4a2bf', firmwareFilename: 'T42S-66.86.0.15.rom' },
      { id: 'T42U', name: 'Yealink T42U (Dual USB)', series: 'T4 Business Series', firmwareVersion: '108.86.0.70', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'T42U-108.86.0.70.rom' },
      { id: 'T43U', name: 'Yealink T43U', series: 'T4 Business Series', firmwareVersion: '108.86.0.70', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'T43U-108.86.0.70.rom' },
      { id: 'T46S', name: 'Yealink T46S (Color Display)', series: 'T4 Executive Series', firmwareVersion: '66.86.0.15', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=6b82542a78b4a2bf', firmwareFilename: 'T46S-66.86.0.15.rom' },
      { id: 'T46U', name: 'Yealink T46U (Dual USB Gigabit)', series: 'T4 Executive Series', firmwareVersion: '108.86.0.70', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'T46U-108.86.0.70.rom', firmwareNotes: 'Latest stable release with acoustic shield support' },
      { id: 'T48S', name: 'Yealink T48S (7" Touchscreen)', series: 'T4 Touch Series', firmwareVersion: '66.86.0.15', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=6b82542a78b4a2bf', firmwareFilename: 'T48S-66.86.0.15.rom' },
      { id: 'T48U', name: 'Yealink T48U (7" Touch Gigabit)', series: 'T4 Touch Series', firmwareVersion: '108.86.0.70', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'T48U-108.86.0.70.rom' },
      { id: 'T53', name: 'Yealink T53', series: 'T5 Prime Series', firmwareVersion: '96.86.0.75', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=140e0be2199b41a3', firmwareFilename: 'T53-96.86.0.75.rom' },
      { id: 'T53W', name: 'Yealink T53W (Built-in Wi-Fi & BT)', series: 'T5 Prime Series', firmwareVersion: '96.86.0.75', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=140e0be2199b41a3', firmwareFilename: 'T53W-96.86.0.75.rom' },
      { id: 'T54W', name: 'Yealink T54W (Color Wi-Fi & BT)', series: 'T5 Prime Series', firmwareVersion: '96.86.0.75', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=140e0be2199b41a3', firmwareFilename: 'T54W-96.86.0.75.rom' },
      { id: 'T57W', name: 'Yealink T57W (7" Touch Wi-Fi)', series: 'T5 Prime Series', firmwareVersion: '96.86.0.75', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=140e0be2199b41a3', firmwareFilename: 'T57W-96.86.0.75.rom' },
      { id: 'T58W', name: 'Yealink T58W (Android Smart Video)', series: 'T5 Smart Series', firmwareVersion: '150.86.0.35', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=140e0be2199b41a3', firmwareFilename: 'T58W-150.86.0.35.rom' },
      { id: 'W60B', name: 'Yealink W60B (DECT Base Station)', series: 'DECT Cordless', firmwareVersion: '77.85.0.35', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=581c7820a40dfc39', firmwareFilename: 'W60B-77.85.0.35.rom' },
      { id: 'W70B', name: 'Yealink W70B (High-Performance DECT Base)', series: 'DECT Cordless', firmwareVersion: '146.85.0.35', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=581c7820a40dfc39', firmwareFilename: 'W70B-146.85.0.35.rom' },
      { id: 'W73P', name: 'Yealink W73P (Compact Modern DECT)', series: 'DECT Cordless', firmwareVersion: '146.85.0.35', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=581c7820a40dfc39', firmwareFilename: 'W73P-146.85.0.35.rom' },
      { id: 'W76P', name: 'Yealink W76P (Ruggedized DECT Cordless)', series: 'DECT Cordless', firmwareVersion: '146.85.0.35', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=581c7820a40dfc39', firmwareFilename: 'W76P-146.85.0.35.rom' },
      { id: 'CP920', name: 'Yealink CP920 (Touch Conference Phone)', series: 'Conference', firmwareVersion: '78.86.0.15', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'CP920-78.86.0.15.rom' },
      { id: 'CP960', name: 'Yealink CP960 (Enterprise Android Conference)', series: 'Conference', firmwareVersion: '73.86.0.30', firmwareUrl: 'https://support.yealink.com/en/portal/docList?archiveType=software&productCode=7cf8d01d51a6d459', firmwareFilename: 'CP960-73.86.0.30.rom' }
    ]
  },
  {
    id: 'grandstream',
    name: 'Grandstream (XML)',
    configExt: '.xml',
    vendorDocUrl: 'https://www.grandstream.com/support/firmware',
    models: [
      { id: 'GXP1610', name: 'Grandstream GXP1610 / 1615', series: 'GXP Essential', firmwareVersion: '1.0.7.53', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp1600fw.bin' },
      { id: 'GXP1625', name: 'Grandstream GXP1625 (HD Audio)', series: 'GXP Essential', firmwareVersion: '1.0.7.53', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp1600fw.bin' },
      { id: 'GXP2130', name: 'Grandstream GXP2130 (Color Gigabit)', series: 'GXP Enterprise', firmwareVersion: '1.0.11.64', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp2100fw.bin' },
      { id: 'GXP2135', name: 'Grandstream GXP2135 (32 Digital BLF)', series: 'GXP Enterprise', firmwareVersion: '1.0.11.64', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp2100fw.bin' },
      { id: 'GXP2140', name: 'Grandstream GXP2140 (Executive 4-Line)', series: 'GXP Enterprise', firmwareVersion: '1.0.11.64', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp2100fw.bin' },
      { id: 'GXP2160', name: 'Grandstream GXP2160 (6-Line 24 BLF Keys)', series: 'GXP Enterprise', firmwareVersion: '1.0.11.64', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp2100fw.bin' },
      { id: 'GXP2170', name: 'Grandstream GXP2170 (12-Line 48 BLF)', series: 'GXP Enterprise', firmwareVersion: '1.0.11.64', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'gxp2100fw.bin' },
      { id: 'GRP2601', name: 'Grandstream GRP2601 / 2601P', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2600fw.bin' },
      { id: 'GRP2602', name: 'Grandstream GRP2602 / 2602P / 2602W (Wi-Fi)', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2600fw.bin' },
      { id: 'GRP2612', name: 'Grandstream GRP2612 / 2612W (Color LCD)', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2610fw.bin' },
      { id: 'GRP2614', name: 'Grandstream GRP2614 (Dual LCD Screens)', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2610fw.bin' },
      { id: 'GRP2615', name: 'Grandstream GRP2615 (10-Line Color Wi-Fi)', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2610fw.bin' },
      { id: 'GRP2616', name: 'Grandstream GRP2616 (Flagship Dual Screen)', series: 'GRP Carrier-Grade', firmwareVersion: '1.0.9.103', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'grp2610fw.bin' },
      { id: 'WP810', name: 'Grandstream WP810 (Dual-Band Wi-Fi Handset)', series: 'Cordless Wi-Fi', firmwareVersion: '1.0.11.20', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'wp810fw.bin' },
      { id: 'WP820', name: 'Grandstream WP820 (Enterprise Wi-Fi Handset)', series: 'Cordless Wi-Fi', firmwareVersion: '1.0.11.20', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'wp820fw.bin' },
      { id: 'WP825', name: 'Grandstream WP825 (Ruggedized Wi-Fi Cordless)', series: 'Cordless Wi-Fi', firmwareVersion: '1.0.11.20', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'wp825fw.bin' },
      { id: 'DP750', name: 'Grandstream DP750 / DP720 (DECT Base Station)', series: 'DECT Cordless', firmwareVersion: '1.0.17.4', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'dp750fw.bin' },
      { id: 'DP752', name: 'Grandstream DP752 / DP730 (Long-Range DECT)', series: 'DECT Cordless', firmwareVersion: '1.0.21.9', firmwareUrl: 'https://www.grandstream.com/support/firmware', firmwareFilename: 'dp752fw.bin' }
    ]
  },
  {
    id: 'fanvil',
    name: 'Fanvil (XML)',
    configExt: '.xml',
    vendorDocUrl: 'https://www.fanvil.com/service/doc/soft/index.html',
    models: [
      { id: 'X1S', name: 'Fanvil X1S / X1SG (Entry Gigabit)', series: 'X Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x1sg_v2.bin' },
      { id: 'X3S', name: 'Fanvil X3S / X3SP / X3SG (Color Display)', series: 'X Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x3sg_v2.bin' },
      { id: 'X3U', name: 'Fanvil X3U (Pro Gigabit Color)', series: 'X-U Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x3u_v2.bin' },
      { id: 'X4U', name: 'Fanvil X4U (Dual Color Screens 12 DSS)', series: 'X-U Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x4u_v2.bin' },
      { id: 'X5U', name: 'Fanvil X5U (Dual Color Screens 30 DSS)', series: 'X-U Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x5u_v2.bin' },
      { id: 'X6U', name: 'Fanvil X6U (Triple Color Screens 60 DSS)', series: 'X-U Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x6u_v2.bin' },
      { id: 'X7', name: 'Fanvil X7 (7" Touchscreen 127 DSS)', series: 'X Touch Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x7_v2.bin' },
      { id: 'X7C', name: 'Fanvil X7C (5" Color Screen 60 DSS)', series: 'X Touch Series', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x7c_v2.bin' },
      { id: 'X210', name: 'Fanvil X210 (Enterprise 106 DSS Keys)', series: 'Executive', firmwareVersion: '2.12.16', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_x210_v2.bin' },
      { id: 'V62', name: 'Fanvil V62 (Prime Series Gigabit)', series: 'V Prime Series', firmwareVersion: '2.14.3', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_v62_v2.bin' },
      { id: 'V64', name: 'Fanvil V64 (Prime Color Wi-Fi & BT)', series: 'V Prime Series', firmwareVersion: '2.14.3', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_v64_v2.bin' },
      { id: 'V65', name: 'Fanvil V65 (Flagship Smart Screen)', series: 'V Prime Series', firmwareVersion: '2.14.3', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_v65_v2.bin' },
      { id: 'H2U', name: 'Fanvil H2U (Compact Wall/Hotel Phone)', series: 'H Hotel Series', firmwareVersion: '2.12.15', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_h2u_v2.bin' },
      { id: 'H3', name: 'Fanvil H3 (Hotel Guestroom Phone)', series: 'H Hotel Series', firmwareVersion: '2.12.15', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_h3_v2.bin' },
      { id: 'H5', name: 'Fanvil H5 (Color Screen Hotel Phone)', series: 'H Hotel Series', firmwareVersion: '2.12.15', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_h5_v2.bin' },
      { id: 'PA2', name: 'Fanvil PA2 / PA3 (SIP Paging & Intercom Gateway)', series: 'Intercom', firmwareVersion: '2.12.15', firmwareUrl: 'https://www.fanvil.com/service/doc/soft/index.html', firmwareFilename: 'fanvil_pa2_v2.bin' }
    ]
  },
  {
    id: 'poly',
    name: 'Poly / Polycom (CFG)',
    configExt: '.cfg',
    vendorDocUrl: 'https://support.hp.com/poly',
    models: [
      { id: 'VVX-150', name: 'Poly VVX 150 (2-Line Business)', series: 'VVX x50 Series', firmwareVersion: '6.4.5.0118', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-48810-001.sip.ld' },
      { id: 'VVX-250', name: 'Poly VVX 250 (4-Line Color)', series: 'VVX x50 Series', firmwareVersion: '6.4.5.0118', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-48820-001.sip.ld' },
      { id: 'VVX-350', name: 'Poly VVX 350 (6-Line Gigabit)', series: 'VVX x50 Series', firmwareVersion: '6.4.5.0118', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-48830-001.sip.ld' },
      { id: 'VVX-450', name: 'Poly VVX 450 (12-Line Executive)', series: 'VVX x50 Series', firmwareVersion: '6.4.5.0118', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-48840-001.sip.ld', firmwareNotes: 'Latest Poly Voice Software (PVOS) release' },
      { id: 'VVX-300', name: 'Poly VVX 300 / 310', series: 'VVX Legacy', firmwareVersion: '5.9.8.5959', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-46157-001.sip.ld' },
      { id: 'VVX-400', name: 'Poly VVX 400 / 410', series: 'VVX Legacy', firmwareVersion: '5.9.8.5959', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-46162-001.sip.ld' },
      { id: 'VVX-500', name: 'Poly VVX 500 / 501', series: 'VVX Legacy', firmwareVersion: '5.9.8.5959', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-44500-001.sip.ld' },
      { id: 'VVX-600', name: 'Poly VVX 600 / 601', series: 'VVX Legacy', firmwareVersion: '5.9.8.5959', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-44600-001.sip.ld' },
      { id: 'Edge-E100', name: 'Poly Edge E100 (2-Line Microban)', series: 'Edge E Series', firmwareVersion: '8.1.3.1328', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: 'poly-edge-e100.bin' },
      { id: 'Edge-E220', name: 'Poly Edge E220 (4-Line Bluetooth)', series: 'Edge E Series', firmwareVersion: '8.1.3.1328', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: 'poly-edge-e220.bin' },
      { id: 'Edge-E320', name: 'Poly Edge E320 (8-Line Wi-Fi)', series: 'Edge E Series', firmwareVersion: '8.1.3.1328', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: 'poly-edge-e320.bin' },
      { id: 'Edge-E450', name: 'Poly Edge E450 (14-Line Dual LCD)', series: 'Edge E Series', firmwareVersion: '8.1.3.1328', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: 'poly-edge-e450.bin' },
      { id: 'Trio-8500', name: 'Poly Trio 8500 (Conference Smart IP)', series: 'Trio Series', firmwareVersion: '7.2.5.0085', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-66700-001.sip.ld' },
      { id: 'Trio-8800', name: 'Poly Trio 8800 (Large Room Conference)', series: 'Trio Series', firmwareVersion: '7.2.5.0085', firmwareUrl: 'https://support.hp.com/poly', firmwareFilename: '3111-65290-001.sip.ld' }
    ]
  },
  {
    id: 'cisco',
    name: 'Cisco / Linksys (SPA & MPP XML)',
    configExt: '.cfg',
    vendorDocUrl: 'https://software.cisco.com/',
    models: [
      { id: 'SPA504G', name: 'Cisco SPA504G (4-Line IP Phone)', series: 'SPA 500 Series', firmwareVersion: '7.6.2e', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'spa50x-30x-7-6-2e.bin' },
      { id: 'SPA525G2', name: 'Cisco SPA525G2 (Color 5-Line Wi-Fi)', series: 'SPA 500 Series', firmwareVersion: '7.6.2e', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'spa525g-7-6-2e.bin' },
      { id: 'SPA112', name: 'Cisco SPA112 (2-Port FXS ATA Gateway)', series: 'SPA ATA Series', firmwareVersion: '1.4.1.SR5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'spa112-1-4-1-SR5.bin' },
      { id: 'SPA122', name: 'Cisco SPA122 (ATA with Router/WAN)', series: 'SPA ATA Series', firmwareVersion: '1.4.1.SR5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'spa122-1-4-1-SR5.bin' },
      { id: 'MPP-6821', name: 'Cisco MPP 6821 (Multiplatform Phone)', series: 'MPP 6800 Series', firmwareVersion: '12.0.2', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip68xx.12-0-2MPP.loads' },
      { id: 'MPP-6851', name: 'Cisco MPP 6851 (Multiplatform Gigabit)', series: 'MPP 6800 Series', firmwareVersion: '12.0.2', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip68xx.12-0-2MPP.loads' },
      { id: 'MPP-7821', name: 'Cisco MPP 7821 (2-Line HD Multiplatform)', series: 'MPP 7800 Series', firmwareVersion: '14.2.1-0101', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip78xx.14-2-1-0101-44MPP.loads' },
      { id: 'MPP-7841', name: 'Cisco MPP 7841 (4-Line Gigabit Multiplatform)', series: 'MPP 7800 Series', firmwareVersion: '14.2.1-0101', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip78xx.14-2-1-0101-44MPP.loads' },
      { id: 'MPP-8841', name: 'Cisco MPP 8841 (Color Gigabit Multiplatform)', series: 'MPP 8800 Series', firmwareVersion: '14.2.1-0101', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' },
      { id: 'MPP-8851', name: 'Cisco MPP 8851 (Executive USB/BT Multiplatform)', series: 'MPP 8800 Series', firmwareVersion: '14.2.1-0101', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' },
      { id: 'MPP-8861', name: 'Cisco MPP 8861 (Executive Wi-Fi/BT Multiplatform)', series: 'MPP 8800 Series', firmwareVersion: '14.2.1-0101', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'sip88xx.14-2-1-0101-44MPP.loads' }
    ]
  },
  {
    id: 'snom',
    name: 'Snom (XML)',
    configExt: '.xml',
    vendorDocUrl: 'https://service.snom.com/',
    models: [
      { id: 'D712', name: 'Snom D712 (4-Line Standard)', series: 'D700 Series', firmwareVersion: '10.1.127.10', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD712-10.1.127.10-SIP-r.bin' },
      { id: 'D717', name: 'Snom D717 (Color Screen Gigabit)', series: 'D700 Series', firmwareVersion: '10.1.127.10', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD717-10.1.127.10-SIP-r.bin' },
      { id: 'D735', name: 'Snom D735 (Color Sensor Motion Display)', series: 'D700 Series', firmwareVersion: '10.1.127.10', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD735-10.1.127.10-SIP-r.bin' },
      { id: 'D785', name: 'Snom D785 (Dual Display 24 BLF Keys)', series: 'D700 Series', firmwareVersion: '10.1.127.10', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD785-10.1.127.10-SIP-r.bin', firmwareNotes: 'Latest stable release with TLS 1.3 & SRTP default' },
      { id: 'D862', name: 'Snom D862 (5" LCD Flagship)', series: 'D800 Series', firmwareVersion: '10.1.141.0', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD862-10.1.141.0-SIP-r.bin' },
      { id: 'D865', name: 'Snom D865 (Flagship Wi-Fi & BT)', series: 'D800 Series', firmwareVersion: '10.1.141.0', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomD865-10.1.141.0-SIP-r.bin' },
      { id: 'M300', name: 'Snom M300 (Single-Cell DECT Base)', series: 'M DECT Series', firmwareVersion: '05.30.0002', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomM300-05.30.0002.bin' },
      { id: 'M900', name: 'Snom M900 (Multi-Cell DECT Enterprise Base)', series: 'M DECT Series', firmwareVersion: '06.10.0001', firmwareUrl: 'https://service.snom.com/', firmwareFilename: 'snomM900-06.10.0001.bin' }
    ]
  },
  {
    id: 'gigaset',
    name: 'Gigaset pro (XML)',
    configExt: '.xml',
    vendorDocUrl: 'https://teamwork.gigaset.com/',
    models: [
      { id: 'Maxwell-2', name: 'Gigaset Maxwell 2 (High-Definition Desktop)', series: 'Maxwell Series', firmwareVersion: '2.24.4', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'maxwell2-2.24.4.bin' },
      { id: 'Maxwell-3', name: 'Gigaset Maxwell 3 (Color Gigabit Desktop)', series: 'Maxwell Series', firmwareVersion: '2.24.4', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'maxwell3-2.24.4.bin' },
      { id: 'Maxwell-4', name: 'Gigaset Maxwell 4 (4.3" Touchscreen Desktop)', series: 'Maxwell Series', firmwareVersion: '2.24.4', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'maxwell4-2.24.4.bin' },
      { id: 'N510', name: 'Gigaset N510 IP Pro (Single-Cell DECT Base)', series: 'DECT IP Pro', firmwareVersion: '42.259', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'n510-42.259.bin' },
      { id: 'N670', name: 'Gigaset N670 IP Pro (Single/Multi-Cell DECT Base)', series: 'DECT IP Pro', firmwareVersion: '2.53.0', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'n670-2.53.0.bin' },
      { id: 'N870', name: 'Gigaset N870 IP Pro (Enterprise Multi-Cell DECT)', series: 'DECT IP Pro', firmwareVersion: '2.53.0', firmwareUrl: 'https://teamwork.gigaset.com/', firmwareFilename: 'n870-2.53.0.bin' }
    ]
  }
];

export const ROUTER_CATALOG: DeviceBrandMeta[] = [
  {
    id: 'mikrotik',
    name: 'MikroTik RouterOS (v6/v7 .rsc)',
    configExt: '.rsc',
    vendorDocUrl: 'https://mikrotik.com/download',
    models: [
      { id: 'hex', name: 'MikroTik hEX (RB750Gr3 / RB760iGS)', series: 'Small Branch', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-mmips.npk', firmwareNotes: 'Latest RouterOS v7 release. Native SIP helper control and FastTrack bypass' },
      { id: 'rb3011', name: 'MikroTik RB3011UiAS-RM (10-Port Gigabit)', series: 'Mid-Market', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm.npk' },
      { id: 'rb4011', name: 'MikroTik RB4011iGS+ (Quad-Core 10G SFP+)', series: 'Enterprise', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm.npk' },
      { id: 'rb5009', name: 'MikroTik RB5009UG+S+IN (Heavy Duty 2.5G)', series: 'Enterprise', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm64.npk' },
      { id: 'ccr2004', name: 'MikroTik CCR2004-16G-2S+ (Cloud Core)', series: 'Data Center', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm64.npk' },
      { id: 'ccr2116', name: 'MikroTik CCR2116-12G-4S+ (16-Core Carrier)', series: 'Data Center', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm64.npk' },
      { id: 'hap-ax3', name: 'MikroTik hAP ax3 / ax2 (Wi-Fi 6 VoIP Gateway)', series: 'Wireless Branch', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'routeros-7.16.1-arm64.npk' },
      { id: 'chr', name: 'MikroTik Cloud Hosted Router (CHR / x86 VM)', series: 'Virtual Appliance', firmwareVersion: 'RouterOS v7.16.1', firmwareUrl: 'https://mikrotik.com/download', firmwareFilename: 'chr-7.16.1.img.zip' }
    ]
  },
  {
    id: 'tplink',
    name: 'TP-Link (Omada SDN & Archer/VR Series)',
    configExt: '.txt',
    vendorDocUrl: 'https://www.tp-link.com/support/download/',
    models: [
      { id: 'er605', name: 'TP-Link Omada ER605 (TL-R605 Gigabit VPN)', series: 'Omada Gigabit', firmwareVersion: 'Firmware v2.2.4', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER605v2_un_2.2.4.bin', firmwareNotes: 'Omada SDN Gateway with hardware SIP ALG bypass & Option 66' },
      { id: 'er7206', name: 'TP-Link Omada ER7206 (TL-ER7206 SFP Gigabit)', series: 'Omada Enterprise', firmwareVersion: 'Firmware v1.4.1', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER7206v1_un_1.4.1.bin' },
      { id: 'er707-m2', name: 'TP-Link Omada ER707-M2 (Multi-Gigabit 2.5G)', series: 'Omada Multi-Gig', firmwareVersion: 'Firmware v1.2.2', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER707-M2v1_un_1.2.2.bin' },
      { id: 'er8411', name: 'TP-Link Omada ER8411 (Enterprise 10G SFP+)', series: 'Omada 10G', firmwareVersion: 'Firmware v1.2.0', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER8411v1_un_1.2.0.bin' },
      { id: 'vr2100v', name: 'TP-Link Archer VR2100v (Super VDSL VoIP Gateway)', series: 'Archer VoIP Series', firmwareVersion: 'Firmware v1.1.0', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'Archer_VR2100vv1.bin' },
      { id: 'vx220-g2v', name: 'TP-Link VX220-G2v (Wi-Fi 6 VDSL VoIP Router)', series: 'ISP VoIP Series', firmwareVersion: 'Firmware v2.0.0', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'VX220-G2vv2.bin' }
    ]
  },
  {
    id: 'technicolor',
    name: 'Technicolor / Thomson (Homeware & OpenWrt)',
    configExt: '.sh',
    vendorDocUrl: 'https://www.technicolor.com/',
    models: [
      { id: 'dga4130', name: 'Technicolor DGA4130 (VDSL2 35b / EVDSL Gateway)', series: 'DGA Series', firmwareVersion: 'Homeware 18.2 / OpenWrt', firmwareUrl: 'https://github.com/luci-subsystem', firmwareFilename: 'AGTEF_1.1.0_CLOSED.rbi', firmwareNotes: 'Broadcom BCM63138. Direct UCI firewall SIP ALG kill and dnsmasq Option 66' },
      { id: 'dga4132', name: 'Technicolor DGA4132 / Tim Hub (VDSL2 & SFP FTTH)', series: 'DGA Series', firmwareVersion: 'Homeware 18.2 / OpenWrt', firmwareUrl: 'https://github.com/luci-subsystem', firmwareFilename: 'DGA4132_2.2.1_CLOSED.rbi' },
      { id: 'tg588v2', name: 'Technicolor TG588v v2 (VDSL2 / ADSL2+ Gateway)', series: 'TG Series', firmwareVersion: 'Homeware 17.2', firmwareUrl: 'https://www.technicolor.com/', firmwareFilename: 'TG588v2_17.2.rbi' },
      { id: 'tg589vac', name: 'Technicolor TG589vac v2 (Dual-Band AC VDSL Gateway)', series: 'TG Series', firmwareVersion: 'Homeware 17.2', firmwareUrl: 'https://www.technicolor.com/', firmwareFilename: 'TG589vac_17.2.rbi' },
      { id: 'tg789vac', name: 'Technicolor TG789vac v2 (Gigabit Ethernet WAN/VDSL)', series: 'TG Series', firmwareVersion: 'Homeware 17.2', firmwareUrl: 'https://www.technicolor.com/', firmwareFilename: 'TG789vac_17.2.rbi' },
      { id: 'dga0122', name: 'Technicolor DGA0122 (Wi-Fi 5 Gigabit VoIP Gateway)', series: 'DGA Series', firmwareVersion: 'Homeware 18.3', firmwareUrl: 'https://www.technicolor.com/', firmwareFilename: 'DGA0122_18.3.rbi' },
      { id: 'cga4233', name: 'Technicolor CGA4233 (DOCSIS 3.1 & Gigabit VoIP Gateway)', series: 'CGA Series', firmwareVersion: 'Homeware 19.4', firmwareUrl: 'https://www.technicolor.com/', firmwareFilename: 'CGA4233_19.4.bin' }
    ]
  },
  {
    id: 'cisco',
    name: 'Cisco (IOS ISR, RV-Series & Catalyst)',
    configExt: '.cfg',
    vendorDocUrl: 'https://software.cisco.com/',
    models: [
      { id: 'isr-1100', name: 'Cisco ISR 1100 (1100-4P / 1100-8P)', series: 'ISR 1000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'c1100-universalk9.17.09.05.SPA.bin', firmwareNotes: 'Enterprise branch router with MQC QoS and SIP inspection control' },
      { id: 'isr-4321', name: 'Cisco ISR 4321 (Modular Enterprise Router)', series: 'ISR 4000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'isr4300-universalk9.17.09.05.SPA.bin' },
      { id: 'isr-4331', name: 'Cisco ISR 4331 (Voice Gateway Ready)', series: 'ISR 4000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'isr4300-universalk9.17.09.05.SPA.bin' },
      { id: 'isr-4451', name: 'Cisco ISR 4451-X (High-Performance Branch)', series: 'ISR 4000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'isr4400-universalk9.17.09.05.SPA.bin' },
      { id: 'rv340', name: 'Cisco Small Business RV340 / RV340W (Dual-WAN VPN)', series: 'RV Series', firmwareVersion: 'Firmware 1.0.03.30', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'RV34X-v1.0.03.30.img' },
      { id: 'rv260', name: 'Cisco Small Business RV260 / RV260W (VPN Router)', series: 'RV Series', firmwareVersion: 'Firmware 1.0.01.12', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'RV260-v1.0.01.12.img' },
      { id: 'c8200', name: 'Cisco Catalyst 8200 Edge Platform', series: 'Catalyst 8000', firmwareVersion: 'Cisco IOS XE 17.12.3', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'c8200-universalk9.17.12.03.SPA.bin' },
      { id: 'c8300', name: 'Cisco Catalyst 8300 Edge Platform', series: 'Catalyst 8000', firmwareVersion: 'Cisco IOS XE 17.12.3', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'c8300-universalk9.17.12.03.SPA.bin' }
    ]
  },
  {
    id: 'draytek',
    name: 'DrayTek Vigor Series',
    configExt: '.txt',
    vendorDocUrl: 'https://www.draytek.com/support/latest-firmwares/',
    models: [
      { id: 'vigor-2860', name: 'DrayTek Vigor 2860 / 2860n / 2860ac', series: 'Vigor 2860 Series', firmwareVersion: 'Firmware 3.9.2', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2860_392.all', firmwareNotes: 'DrayOS with native hardware SIP ALG kill (sys sip_alg 0) and BWM QoS' },
      { id: 'vigor-2862', name: 'DrayTek Vigor 2862 / 2862Lac (VDSL / LTE)', series: 'Vigor 2860 Series', firmwareVersion: 'Firmware 3.9.7', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2862_397.all' },
      { id: 'vigor-2865', name: 'DrayTek Vigor 2865 / 2865ac (VDSL / GbE)', series: 'Vigor 2860 Series', firmwareVersion: 'Firmware 4.4.5', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2865_445.all' },
      { id: 'vigor-2866', name: 'DrayTek Vigor 2866 / 2866Lac (G.Fast / LTE)', series: 'Vigor 2860 Series', firmwareVersion: 'Firmware 4.4.5', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2866_445.all' },
      { id: 'vigor-2925', name: 'DrayTek Vigor 2925 / 2925n (Dual-WAN GbE)', series: 'Vigor 2920 Series', firmwareVersion: 'Firmware 3.9.2', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2925_392.all' },
      { id: 'vigor-2926', name: 'DrayTek Vigor 2926 / 2926ac (Dual-WAN GbE)', series: 'Vigor 2920 Series', firmwareVersion: 'Firmware 3.9.7', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2926_397.all' },
      { id: 'vigor-2927', name: 'DrayTek Vigor 2927 / 2927ac (Dual-WAN GbE)', series: 'Vigor 2920 Series', firmwareVersion: 'Firmware 4.4.5', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2927_445.all' },
      { id: 'vigor-2960', name: 'DrayTek Vigor 2960 (High-Throughput Dual-WAN)', series: 'Vigor High-Speed', firmwareVersion: 'Firmware 1.5.1.4', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2960_1514.all' },
      { id: 'vigor-2962', name: 'DrayTek Vigor 2962 (2.5G Multi-WAN)', series: 'Vigor High-Speed', firmwareVersion: 'Firmware 4.4.5', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v2962_445.all' },
      { id: 'vigor-3910', name: 'DrayTek Vigor 3910 (10G Multi-WAN Enterprise)', series: 'Vigor Enterprise', firmwareVersion: 'Firmware 4.4.5', firmwareUrl: 'https://www.draytek.com/support/latest-firmwares/', firmwareFilename: 'v3910_445.all' }
    ]
  },
  {
    id: 'pfsense',
    name: 'pfSense / Netgate (Static Port NAT & QoS)',
    configExt: '.txt',
    vendorDocUrl: 'https://www.pfsense.org/download/',
    models: [
      { id: 'netgate-1100', name: 'Netgate 1100 (SOHO Desktop Appliance)', series: 'Netgate Appliance', firmwareVersion: 'pfSense Plus 23.09.1 / CE 2.7.2', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-CE-2.7.2-RELEASE.iso.gz' },
      { id: 'netgate-2100', name: 'Netgate 2100 (Branch Office Appliance)', series: 'Netgate Appliance', firmwareVersion: 'pfSense Plus 23.09.1', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-Plus-23.09.1.img' },
      { id: 'netgate-4100', name: 'Netgate 4100 (Enterprise Desktop Appliance)', series: 'Netgate Appliance', firmwareVersion: 'pfSense Plus 23.09.1', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-Plus-23.09.1.img' },
      { id: 'netgate-6100', name: 'Netgate 6100 (Multi-Gig / 10G SFP+ Appliance)', series: 'Netgate Appliance', firmwareVersion: 'pfSense Plus 23.09.1', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-Plus-23.09.1.img' },
      { id: 'netgate-8200', name: 'Netgate 8200 (Rackmount Enterprise Appliance)', series: 'Netgate Appliance', firmwareVersion: 'pfSense Plus 23.09.1', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-Plus-23.09.1.img' },
      { id: 'pfsense-custom', name: 'pfSense Community Edition (x86 Bare Metal / Proxmox VM)', series: 'x86 Architecture', firmwareVersion: 'pfSense CE 2.7.2-RELEASE', firmwareUrl: 'https://www.pfsense.org/download/', firmwareFilename: 'pfSense-CE-2.7.2-RELEASE-amd64.iso.gz' }
    ]
  },
  {
    id: 'opnsense',
    name: 'OPNsense Firewall (Static Port NAT)',
    configExt: '.txt',
    vendorDocUrl: 'https://opnsense.org/download/',
    models: [
      { id: 'dec600', name: 'Deciso DEC600 Series', series: 'Deciso Hardware', firmwareVersion: 'OPNsense 24.7 Business Edition', firmwareUrl: 'https://opnsense.org/download/', firmwareFilename: 'OPNsense-24.7-OpenSSL-dvd-amd64.iso.bz2' },
      { id: 'dec700', name: 'Deciso DEC700 Series (Desktop SFP+)', series: 'Deciso Hardware', firmwareVersion: 'OPNsense 24.7 Business Edition', firmwareUrl: 'https://opnsense.org/download/', firmwareFilename: 'OPNsense-24.7-OpenSSL-dvd-amd64.iso.bz2' },
      { id: 'dec800', name: 'Deciso DEC800 Series', series: 'Deciso Hardware', firmwareVersion: 'OPNsense 24.7 Business Edition', firmwareUrl: 'https://opnsense.org/download/', firmwareFilename: 'OPNsense-24.7-OpenSSL-dvd-amd64.iso.bz2' },
      { id: 'dec2600', name: 'Deciso DEC2600 Series (1U Rackmount)', series: 'Deciso Hardware', firmwareVersion: 'OPNsense 24.7 Business Edition', firmwareUrl: 'https://opnsense.org/download/', firmwareFilename: 'OPNsense-24.7-OpenSSL-dvd-amd64.iso.bz2' },
      { id: 'opnsense-custom', name: 'OPNsense Community (Custom x86 Appliance / Proxmox VM)', series: 'x86 Architecture', firmwareVersion: 'OPNsense 24.7.4-amd64', firmwareUrl: 'https://opnsense.org/download/', firmwareFilename: 'OPNsense-24.7.4-OpenSSL-dvd-amd64.iso.bz2' }
    ]
  },
  {
    id: 'switch',
    name: 'Cisco Catalyst Switch (Voice VLAN .cfg)',
    configExt: '.cfg',
    vendorDocUrl: 'https://software.cisco.com/',
    models: [
      { id: 'c2960x', name: 'Cisco Catalyst 2960-X / 2960-XR (24/48 PoE+)', series: 'Catalyst Access', firmwareVersion: 'Cisco IOS 15.2(7)E10', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'c2960x-universalk9-tar.152-7.E10.tar' },
      { id: 'c3560cx', name: 'Cisco Catalyst 3560-CX (Compact Gigabit PoE)', series: 'Catalyst Compact', firmwareVersion: 'Cisco IOS 15.2(7)E10', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'c3560cx-universalk9-tar.152-7.E10.tar' },
      { id: 'c3650', name: 'Cisco Catalyst 3650 / 3850 (Multi-Gigabit PoE)', series: 'Catalyst Campus', firmwareVersion: 'Cisco IOS XE 16.12.10a', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'cat3k_caa-universalk9.16.12.10a.SPA.bin' },
      { id: 'c9200', name: 'Cisco Catalyst 9200 / 9200L (Enterprise Access)', series: 'Catalyst 9000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'cat9k_lite_iosxe.17.09.05.SPA.bin' },
      { id: 'c9300', name: 'Cisco Catalyst 9300 (Stackable Enterprise)', series: 'Catalyst 9000', firmwareVersion: 'Cisco IOS XE 17.9.5', firmwareUrl: 'https://software.cisco.com/', firmwareFilename: 'cat9k_iosxe.17.09.05.SPA.bin' }
    ]
  },
  {
    id: 'meraki',
    name: 'Cisco Meraki MX Security Appliance',
    configExt: '.txt',
    vendorDocUrl: 'https://documentation.meraki.com/MX',
    models: [
      { id: 'mx67', name: 'Cisco Meraki MX67 / MX67W (Branch Gateway)', series: 'Meraki Small Branch', firmwareVersion: 'Meraki MX 18.211', firmwareUrl: 'https://documentation.meraki.com/MX', firmwareFilename: 'Cloud Firmware Managed' },
      { id: 'mx68', name: 'Cisco Meraki MX68 / MX68W / MX68CW', series: 'Meraki Branch PoE', firmwareVersion: 'Meraki MX 18.211', firmwareUrl: 'https://documentation.meraki.com/MX', firmwareFilename: 'Cloud Firmware Managed' },
      { id: 'mx85', name: 'Cisco Meraki MX85 (Gigabit Mid-Market)', series: 'Meraki Enterprise', firmwareVersion: 'Meraki MX 18.211', firmwareUrl: 'https://documentation.meraki.com/MX', firmwareFilename: 'Cloud Firmware Managed' },
      { id: 'mx95', name: 'Cisco Meraki MX95 (Multi-Gigabit 10G)', series: 'Meraki Enterprise', firmwareVersion: 'Meraki MX 18.211', firmwareUrl: 'https://documentation.meraki.com/MX', firmwareFilename: 'Cloud Firmware Managed' },
      { id: 'mx105', name: 'Cisco Meraki MX105 (High-Throughput Campus)', series: 'Meraki Campus', firmwareVersion: 'Meraki MX 18.211', firmwareUrl: 'https://documentation.meraki.com/MX', firmwareFilename: 'Cloud Firmware Managed' }
    ]
  },
  {
    id: 'fortinet',
    name: 'Fortinet FortiGate (FortiOS)',
    configExt: '.conf',
    vendorDocUrl: 'https://support.fortinet.com/',
    models: [
      { id: 'fg-40f', name: 'Fortinet FortiGate 40F (Entry Branch)', series: 'FortiGate F-Series', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8', firmwareUrl: 'https://support.fortinet.com/', firmwareFilename: 'FGT_40F-v7-build2662-FORTINET.out' },
      { id: 'fg-60f', name: 'Fortinet FortiGate 60F (SMB Gateway)', series: 'FortiGate F-Series', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8', firmwareUrl: 'https://support.fortinet.com/', firmwareFilename: 'FGT_60F-v7-build2662-FORTINET.out' },
      { id: 'fg-70f', name: 'Fortinet FortiGate 70F (Branch Office)', series: 'FortiGate F-Series', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8', firmwareUrl: 'https://support.fortinet.com/', firmwareFilename: 'FGT_70F-v7-build2662-FORTINET.out' },
      { id: 'fg-80f', name: 'Fortinet FortiGate 80F (Dual Power Branch)', series: 'FortiGate F-Series', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8', firmwareUrl: 'https://support.fortinet.com/', firmwareFilename: 'FGT_80F-v7-build2662-FORTINET.out' },
      { id: 'fg-100f', name: 'Fortinet FortiGate 100F (Mid-Market 10G SFP+)', series: 'FortiGate F-Series', firmwareVersion: 'FortiOS v7.4.4 / v7.2.8', firmwareUrl: 'https://support.fortinet.com/', firmwareFilename: 'FGT_100F-v7-build2662-FORTINET.out' }
    ]
  },
  {
    id: 'sonicwall',
    name: 'SonicWall TZ & NSA Series',
    configExt: '.txt',
    vendorDocUrl: 'https://www.mysonicwall.com/',
    models: [
      { id: 'tz270', name: 'SonicWall TZ270 / TZ270W (Entry SOHO)', series: 'TZ Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_tz270_7.1.1-7058.sig' },
      { id: 'tz370', name: 'SonicWall TZ370 / TZ370W (Branch Office)', series: 'TZ Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_tz370_7.1.1-7058.sig' },
      { id: 'tz470', name: 'SonicWall TZ470 / TZ470W (Multi-Gigabit Branch)', series: 'TZ Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_tz470_7.1.1-7058.sig' },
      { id: 'tz570', name: 'SonicWall TZ570 / TZ570W (5GbE SFP+ Branch)', series: 'TZ Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_tz570_7.1.1-7058.sig' },
      { id: 'tz670', name: 'SonicWall TZ670 (10GbE High-Performance)', series: 'TZ Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_tz670_7.1.1-7058.sig' },
      { id: 'nsa2700', name: 'SonicWall NSA 2700 (Enterprise Mid-Market)', series: 'NSA Series Gen 7', firmwareVersion: 'SonicOS 7.1.1-7058', firmwareUrl: 'https://www.mysonicwall.com/', firmwareFilename: 'sw_nsa2700_7.1.1-7058.sig' }
    ]
  },
  {
    id: 'sophos',
    name: 'Sophos XGS Firewall',
    configExt: '.txt',
    vendorDocUrl: 'https://support.sophos.com/',
    models: [
      { id: 'xgs-87', name: 'Sophos XGS 87 / 87w (Small Office)', series: 'XGS Series', firmwareVersion: 'Sophos Firewall OS v20.0 MR2', firmwareUrl: 'https://support.sophos.com/', firmwareFilename: 'SFOS_20.0.2_MR-2.sig' },
      { id: 'xgs-107', name: 'Sophos XGS 107 / 107w (Branch Office)', series: 'XGS Series', firmwareVersion: 'Sophos Firewall OS v20.0 MR2', firmwareUrl: 'https://support.sophos.com/', firmwareFilename: 'SFOS_20.0.2_MR-2.sig' },
      { id: 'xgs-116', name: 'Sophos XGS 116 / 116w (GbE & SFP)', series: 'XGS Series', firmwareVersion: 'Sophos Firewall OS v20.0 MR2', firmwareUrl: 'https://support.sophos.com/', firmwareFilename: 'SFOS_20.0.2_MR-2.sig' },
      { id: 'xgs-126', name: 'Sophos XGS 126 / 126w (Multi-Port Branch)', series: 'XGS Series', firmwareVersion: 'Sophos Firewall OS v20.0 MR2', firmwareUrl: 'https://support.sophos.com/', firmwareFilename: 'SFOS_20.0.2_MR-2.sig' },
      { id: 'xgs-136', name: 'Sophos XGS 136 / 136w (Dual SFP+ 2.5G)', series: 'XGS Series', firmwareVersion: 'Sophos Firewall OS v20.0 MR2', firmwareUrl: 'https://support.sophos.com/', firmwareFilename: 'SFOS_20.0.2_MR-2.sig' }
    ]
  },
  {
    id: 'omada',
    name: 'TP-Link Omada SDN Gateway',
    configExt: '.txt',
    vendorDocUrl: 'https://www.tp-link.com/support/download/',
    models: [
      { id: 'er605', name: 'TP-Link Omada ER605 (TL-R605 Gigabit VPN)', series: 'Omada Gigabit', firmwareVersion: 'Firmware v2.2.4', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER605v2_un_2.2.4.bin' },
      { id: 'er7206', name: 'TP-Link Omada ER7206 (TL-ER7206 SFP Gigabit)', series: 'Omada Enterprise', firmwareVersion: 'Firmware v1.4.1', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER7206v1_un_1.4.1.bin' },
      { id: 'er707-m2', name: 'TP-Link Omada ER707-M2 (Multi-Gigabit 2.5G)', series: 'Omada Multi-Gig', firmwareVersion: 'Firmware v1.2.2', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER707-M2v1_un_1.2.2.bin' },
      { id: 'er8411', name: 'TP-Link Omada ER8411 (Enterprise 10G SFP+)', series: 'Omada 10G', firmwareVersion: 'Firmware v1.2.0', firmwareUrl: 'https://www.tp-link.com/support/download/', firmwareFilename: 'ER8411v1_un_1.2.0.bin' }
    ]
  },
  {
    id: 'linux',
    name: 'Generic Linux / Dnsmasq (Option 66)',
    configExt: '.sh',
    vendorDocUrl: 'https://thekelleys.org.uk/dnsmasq/doc.html',
    models: [
      { id: 'dnsmasq', name: 'Debian / Ubuntu / AlmaLinux dnsmasq Server', series: 'Linux Gateway', firmwareVersion: 'dnsmasq 2.90+', firmwareUrl: 'https://thekelleys.org.uk/dnsmasq/doc.html', firmwareFilename: 'dnsmasq package' },
      { id: 'isc-dhcp', name: 'ISC DHCP Server (dhcpd.conf)', series: 'Linux Gateway', firmwareVersion: 'isc-dhcp-server 4.4.3+', firmwareUrl: 'https://www.isc.org/dhcp/', firmwareFilename: 'isc-dhcp-server package' },
      { id: 'kea-dhcp', name: 'ISC Kea Modern DHCP Server (kea-dhcp4.json)', series: 'Linux Gateway', firmwareVersion: 'Kea 2.6.1 LTS', firmwareUrl: 'https://www.isc.org/kea/', firmwareFilename: 'kea-dhcp4 package' }
    ]
  }
];

export function generateDefaultHandsetConfig(brand: string, cfg: HandsetAccountConfig, modelId?: string): string {
  const b = (brand || '').toLowerCase();
  
  // Find model metadata if provided
  const brandMeta = HANDSET_CATALOG.find(x => x.id === b);
  const modelMeta = brandMeta?.models.find(m => m.id === modelId) || brandMeta?.models[0];

  if (b === 'grandstream') {
    return generateGrandstreamConfig(cfg);
  }
  if (b === 'fanvil') {
    return generateFanvilConfig(cfg);
  }
  if (b === 'poly' || b === 'polycom') {
    return generatePolyConfig(cfg);
  }
  if (b === 'cisco' || b === 'linksys') {
    return generateCiscoPhoneConfig(cfg);
  }
  if (b === 'snom') {
    return generateSnomConfig(cfg);
  }
  if (b === 'gigaset') {
    return generateGigasetConfig(cfg);
  }

  // Default Yealink
  let conf = generateYealinkConfig(cfg);
  if (modelMeta?.firmwareFilename) {
    conf += `\r\n## Specific Model Firmware Target: ${modelMeta.name} (${modelMeta.firmwareVersion})\r\n`;
    conf += `firmware.url = ${cfg.dataHandlerUrl}/firmware/yealink/${modelMeta.firmwareFilename}\r\n`;
  }
  return conf;
}
