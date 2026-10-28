# CKM Handler Server (`handler.domain.tld`)
### Unified VoIP Provisioning Gateway, Firmware Management Vault & Telemetry Engine

`ckm-handler` is an enterprise communications and device provisioning server built on Node.js/TypeScript and high-performance SQLite (WAL mode). It provides complete auto-provisioning for softphones, physical IP deskphones (Yealink, Snom, Grandstream, Poly, Fanvil, Gigaset, Cisco), VoIP network gateways (TP-Link, MikroTik, Technicolor, Cisco, DrayTek, Ubiquiti, pfSense), real-time device telemetry streaming, an internal model-specific firmware repository with auto-downloading, and European GDPR data isolation.

---

## Table of Contents
1. [Server Architecture & Key Features](#1-server-architecture--key-features)
2. [Quickstart & VPS Deployment](#2-quickstart--vps-deployment)
3. [Admin Dashboard Walkthrough](#3-admin-dashboard-walkthrough)
4. [Internal Firmware Auto-Downloader & Repository](#4-internal-firmware-auto-downloader--repository)
5. [Handset Auto-Provisioning Guide](#5-handset-auto-provisioning-guide)
6. [Router & Network Gateway Configuration](#6-router--network-gateway-configuration)
7. [Real-Time Device Connectivity Shell](#7-real-time-device-connectivity-shell)
8. [GDPR Privacy & Retention Vault](#8-gdpr-privacy--retention-vault)
9. [REST API Reference](#9-rest-api-reference)
10. [Maintenance & Update Commands](#10-maintenance--update-commands)

---

## 1. Server Architecture & Key Features

```
               ┌────────────────────────────────────────────────────────┐
               │         CKM Handler Gateway (Express + SSE)            │
               │            https://handler.domain.tld                  │
               └───────────┬────────────────────────────┬───────────────┘
                           │                            │
      ┌────────────────────┴───────────┐   ┌────────────┴───────────────────┐
      │  Public Device Endpoints       │   │  Authenticated Admin Portal    │
      │  - /provision/:mac.cfg/.xml    │   │  - /admin (Dashboard UI)       │
      │  - /firmware/:brand/:model/bin │   │  - /api/admin/shell/stream     │
      │  - /provision/router/:id.rsc   │   │  - /api/admin/firmware/*       │
      │  - /phonebook/yealink.xml      │   │  - /api/admin/extensions       │
      │  - /sip/provision/:pin         │   │  - /api/admin/gdpr/policy      │
      └────────────────┬───────────────┘   └────────────┬───────────────────┘
                       │                                │
      ┌────────────────┴───────────────┐   ┌────────────┴───────────────────┐
      │  Internal Storage              │   │  Dual Database Architecture    │
      │  data/firmware/{brand}/{model} │   │  - system.db (Zero PII, WAL)   │
      │  data/vault/uploads/           │   │  - comms_vault.db (PII Vault)  │
      └────────────────────────────────┘   └────────────────────────────────┘
```

- **Dual-Database Isolation**: Zero personal data in `system.db` (device MACs, network subnets, API keys, firmware metadata). All user chat messages, contacts, and media reside in encrypted `vault/comms_vault.db` and `vault/uploads/`.
- **Top 6 Prioritized Handsets**: Native manufacturer-compliant configuration engines for **Yealink** (including Next-Gen T7X & T8X), **Snom**, **Grandstream**, **Poly**, **Fanvil**, **Gigaset**, and **Cisco**.
- **Internal Firmware Storage**: Firmwares are automatically organized in a structured internal directory per model (`data/firmware/{brand}/{model}/{filename}`), streamable via HTTP with byte ranges (`Accept-Ranges: bytes`) for Option 66 boot downloads.
- **VoIP Router Profiles**: Pre-compiled mitigation scripts for **TP-Link** (Aginet VZ230v, EX220v, VX220-G2v, Archer AX1800, Omada SDN), **MikroTik RouterOS**, **Technicolor**, **Cisco IOS**, **DrayTek**, **Ubiquiti EdgeOS**, **pfSense/OPNsense**, and **SonicWall**.
- **Live SSE Connectivity Shell**: Real-time server-sent events (SSE) streaming every device boot request, authentication event, Option 66 query, and security warning into an embedded web terminal.

---

## 2. Quickstart & VPS Deployment

### A. Debian 12 / Ubuntu 22.04+ Native Host (Recommended)
CKM Handler runs under Node.js 20+ with PM2 process manager:

```bash
# 1. Clone repository
git clone https://github.com/merlinthedev848/MSuite-SIP.git /root/MSuite-SIP
cd /root/MSuite-SIP/ckm-handler

# 2. Copy files to production web directory
mkdir -p /var/www/ckm-handler
cp -r /root/MSuite-SIP/ckm-handler/* /var/www/ckm-handler/

# 3. Install dependencies & build TypeScript
cd /var/www/ckm-handler
npm install
npm run build

# 4. Launch with PM2
pm2 start dist/server.js --name "ckm-handler"
pm2 save
pm2 startup
```

### B. Environment Configuration (`.env`)
Create or edit `/var/www/ckm-handler/.env`:
```ini
PORT=3000
SERVER_DOMAIN=handler.yourdomain.com
APP_SECRET_KEY=YourSuperSecret64CharacterKeyHere
ADMIN_USER=admin
ADMIN_PASS=YourStrongSecurePassword2026!
DATA_DIR=/var/www/ckm-handler/data
PBX_SERVER=pbx.yourdomain.com
PBX_PORT=5060
PBX_TRANSPORT=UDP
```

### C. Nginx Reverse Proxy & SSL Setup
```nginx
server {
    server_name handler.yourdomain.com;

    client_max_body_size 350M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }
}
```

---

## 3. Admin Dashboard Walkthrough

Access the web dashboard at `https://handler.yourdomain.com/admin`:

1. **System Overview**: Live component telemetry (PBX socket connectivity, system uptime, SQLite WAL health, enrolled extensions, and real-time connectivity statistics).
2. **SIP Extensions & Softphones**:
   - Create extensions with 1 click.
   - Generate temporary **8-Digit PINs** (e.g. `48291044`) for zero-touch softphone login.
   - Generate Customer Welcome Cards with deep-link auto-setup URLs (`merlinsip://provision?code=...`).
3. **Physical IP Handsets**:
   - **Registered Fleet Subview**: Instant search and management of enrolled MAC addresses with test links and per-device custom profile overrides.
   - **Universal Profile & Firmware Explorer Subview**: Interactive compiler for 60+ handset models. Allows generating profiles on the fly and auto-downloading firmwares to internal storage.
4. **VoIP Routers & Network Gateways**:
   - **Site Gateways Subview**: Track deployed office sites, voice VLAN IDs, and subnets.
   - **Router Script & Profile Generator Subview**: Instant generator for MikroTik, TP-Link, Technicolor, Cisco, DrayTek, etc.
5. **Live Connectivity Shell**:
   - Real-time SSE streaming window capturing device requests, registration events, and firmware downloads. Filterable by category (`SYSTEM`, `DESKPHONE`, `SOFTPHONE`, `ROUTER`, `FIRMWARE`, `SECURITY`).
6. **Softphone Branding**: Live theme color picker, organization name, and logo upload that synchronizes to all softphones.
7. **PBX & Integration Gateways**: PBX server address, SIP transport, API key generation, and Asterisk AMI extension import.
8. **GDPR Retention Vault**: Configure retention lifecycle (e.g. 90 days), enable automated pruning, and execute Article 17 Right-to-Erasure with SHA-256 audit certificates.
9. **Administrator Users & RBAC**: Manage admin accounts with granular permissions (`manage_extensions`, `manage_handsets`, `manage_routers`, `view_shell`, `manage_branding`, `gdpr_admin`).

---

## 4. Internal Firmware Auto-Downloader & Repository

CKM Handler includes an internal firmware repository that stores vendor binaries per device model:

### Directory Layout
```text
/data/firmware/
├── yealink/
│   ├── T73U/
│   │   └── T73U-183.86.0.15.rom
│   ├── T74W/
│   │   └── T74W-184.86.0.15.rom
│   ├── T85W/
│   │   └── T85W-195.86.0.10.rom
│   └── T46U/
│       └── T46U-108.86.0.70.rom
├── grandstream/
│   ├── GXP2170/
│   │   └── gxp2100fw.bin
│   └── GRP2615/
│       └── grp2610fw.bin
├── snom/
│   └── D785/
│       └── snomD785-10.1.127.10-SIP-r.bin
├── tplink/
│   ├── VZ230V/
│   │   └── VZ230vv1_un_1.1.0.bin
│   └── VX220-G2V/
│       └── VX220-G2vv2.1.0.bin
└── mikrotik/
    └── HEX/
        └── routeros-7.16.1-mmips.npk
```

### Features
1. **Auto-Download to Server**: In the Handset or Router Explorer, select any model and click **`⚡ Auto-Download to Server`**. The server fetches the stable release directly from vendor repositories, validates file integrity, computes SHA-256, and stores it in the model directory.
2. **Batch Sync**: Click **`⚡ Auto-Download All Stable Firmwares`** to queue background synchronization of all stable packages across all brands.
3. **Manual / Custom Binary Upload**: For models requiring vendor portal credentials (e.g. Cisco Smart Account), click **`⬆️ Upload File`** to upload binaries (up to 350 MB) directly into the model directory.
4. **HTTP Device Streaming**: Devices automatically fetch firmwares using HTTP byte ranges (`206 Partial Content`) via:
   ```text
   https://handler.domain.tld/firmware/{brand}/{model}/{filename}
   https://handler.domain.tld/firmware/{brand}/{filename}
   ```

---

## 5. Handset Auto-Provisioning Guide

### Step 1: Configure Local Router DHCP Option 66
Configure your office router's Voice DHCP server with Option 66 pointing to CKM Handler:
```text
https://handler.domain.tld/provision/
```

### Step 2: Register Handset MAC in Admin Portal
Navigate to **Physical IP Handsets** > **`+ Register Physical Handset`**:
- **MAC Address**: `001565A1B2C3` (12 hex digits)
- **Extension**: Select assigned extension (e.g. `101`)
- **Brand**: `yealink`, `snom`, `grandstream`, `poly`, `fanvil`, `gigaset`, or `cisco`
- **Line Label**: `Sales Office` (optional custom display name)

### Step 3: Boot or Reboot Handset
When powered on, the handset requests its configuration from CKM Handler:
- **Yealink**: `GET /provision/001565a1b2c3.cfg`
- **Snom**: `GET /provision/snom000413112233.xml`
- **Grandstream**: `GET /provision/cfg000b82f1e2d3.xml`
- **Poly**: `GET /provision/0004f2112233-phone.cfg`
- **Fanvil**: `GET /provision/00a0bcf1e2d3.xml`
- **Gigaset**: `GET /provision/0001e3112233.xml`
- **Cisco**: `GET /provision/spa001565a1b2c3.cfg`

The server renders manufacturer-compliant configurations, applies VLAN 20 and DSCP 46 QoS, configures BLF keys, sets the phonebook URL, and instructs the phone to fetch firmware if needed.

---

## 6. Router & Network Gateway Configuration

CKM Handler generates deployment scripts to eliminate VoIP packet corruption:

### Supported Platforms
- **TP-Link**: Aginet VZ230v, EX220v, VX220-G2v, Archer AX1800 (AX20/AX21/AX23), Omada SDN (ER605, ER7206, ER8411).
- **MikroTik**: RouterOS v6 / v7 (`.rsc` format) with FastTrack bypass and SIP helper kill.
- **Technicolor / Thomson**: Homeware 17/18/19 & OpenWrt (`.sh` UCI scripts).
- **Cisco**: IOS XE ISR 1000/4000, Small Business RV-series, and Catalyst 8000 (`.cfg` MQC QoS scripts).
- **DrayTek**: Vigor 2865, 2866, 2927 series text config scripts.
- **Ubiquiti**: EdgeRouter / UniFi Gateway shell commands.
- **pfSense / OPNsense**: Packet filter & dnsmasq Option 66 settings.

### Generating a Router Script
1. Navigate to **VoIP Routers** > **`+ New Router Profile`**.
2. Enter Site Name, select Brand, Model, Voice VLAN (e.g. `20`), and Subnet (e.g. `10.20.0.1/24`).
3. Click **Create Router Profile**.
4. Click **`✏️ Edit Script`**, **`💾 Download`**, or **`🔗 Boot URL`**.
5. Routers can fetch their bootstrap script directly on boot via:
   ```text
   curl -sSL https://handler.domain.tld/provision/router/{id}.rsc | rsc
   ```

---

## 7. Real-Time Device Connectivity Shell

Access the live terminal either from the **Device Connectivity Shell** tab or by clicking **`>_ Shell`** in the top navigation bar to open the bottom drawer.

- **Real-Time SSE Stream**: Automatically establishes an SSE connection to `/api/admin/shell/stream`.
- **Filtering**: Filter logs instantly by:
  - `ALL`: Complete traffic stream
  - `DESKPHONE`: Hardware deskphone provisioning queries
  - `SOFTPHONE`: MerlinSIP desktop/mobile auth & 10-minute syncs
  - `ROUTER`: Router script boots and Option 66 DHCP requests
  - `FIRMWARE`: Firmware download and caching events
  - `SECURITY`: Blocked requests and invalid MAC attempts
- **Grep Search**: Live search input to filter events by IP, extension, MAC, or status in real time.
- **Export**: Export buffer to `.log` text file with 1 click.

---

## 8. GDPR Privacy & Retention Vault

Designed for full compliance with European data privacy regulations:

| Component | Scope | Contains PII? | Retention Rules |
|---|---|---|---|
| `data/system.db` | Operational Hardware | **NO** | Device MACs, voice subnets, SIP usernames, hashed admin logins. |
| `data/vault/comms_vault.db` | Communications | **YES** | Encrypted chat messages, recipient IDs, address book entries. |
| `data/vault/uploads/` | Media Vault | **YES** | Voice notes, attachments, and call logs with UUID filenames. |

### Right to Erasure (Article 17)
1. In Admin Portal > **GDPR Vault**, enter the target extension (e.g. `101`).
2. Click **Execute Right to Erasure**.
3. All chat messages, contacts, and media files associated with that extension are deleted.
4. Generates a tamper-proof **SHA-256 Cryptographic Audit Certificate** stored in the audit trail.

---

## 9. REST API Reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/health` | GET | None | Server health and uptime probe |
| `/provision/:filename` | GET | None | Hardware deskphone dynamic configuration boot |
| `/firmware/:brand/:model/:filename` | GET | None | Internal model firmware binary download (supports byte ranges) |
| `/provision/router/:identifier` | GET | None | Router deployment script bootstrap fetch |
| `/phonebook/yealink.xml` | GET | None | Yealink XML Corporate Phonebook |
| `/phonebook/grandstream.xml` | GET | None | Grandstream XML Corporate Phonebook |
| `/phonebook/fanvil.xml` | GET | None | Fanvil XML Corporate Phonebook |
| `/api/v1/contacts` | GET | None | JSON Corporate Directory for Softphones |
| `/sip/provision/:code` | POST | None | Softphone 8-digit PIN provisioning |
| `/api/v1/config/sync` | GET | None | 10-minute softphone dynamic config sync |
| `/api/admin/catalogs` | GET | None | Metadata catalog of supported handsets & routers |
| `/api/admin/catalogs/preview` | POST | None | Dynamic profile & firmware preview compiler |
| `/api/admin/firmware/status` | GET | Admin | Status of internal firmware model directory cache |
| `/api/admin/firmware/download` | POST | Admin | Trigger auto-download for a specific model |
| `/api/admin/firmware/sync-all` | POST | Admin | Batch auto-download all stable vendor firmwares |
| `/api/admin/firmware/upload` | POST | Admin | Upload firmware binary into model directory |
| `/api/admin/firmware/:brand/:model`| DELETE | Admin | Purge local firmware binary from disk |
| `/api/admin/shell/stream` | GET | Admin | Live Server-Sent Events (SSE) telemetry stream |
| `/api/admin/shell/history` | GET | Admin | Retrieve recent in-memory connectivity log history |
| `/api/admin/handsets` | GET | Admin | List registered physical handsets |
| `/api/admin/routers` | GET | Admin | List site routers and gateways |
| `/api/v1/gdpr/user/:ext` | DELETE | Admin | GDPR Article 17 Right-to-Erasure execution |

---

## 10. Maintenance & Update Commands

### Updating the Server on VPS
Run the automated update command:
```bash
cd /root/MSuite-SIP
git pull origin beta/provisioning-and-contractor-licensing
cp -r /root/MSuite-SIP/ckm-handler/* /var/www/ckm-handler/
cd /var/www/ckm-handler
npm run build
pm2 restart ckm-handler
```

### Checking Server Status & Logs
```bash
pm2 status ckm-handler
pm2 logs ckm-handler --lines 100
```

### Database Backup
```bash
# SQLite WAL safe online backup
sqlite3 /var/www/ckm-handler/data/system.db ".backup '/var/backups/system_$(date +%F).db'"
sqlite3 /var/www/ckm-handler/data/vault/comms_vault.db ".backup '/var/backups/vault_$(date +%F).db'"
```
