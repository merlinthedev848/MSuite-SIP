# Merlin SIP & CKM Handler Platform

A unified enterprise communications suite combining a native Windows desktop softphone with **CKM Handler**, an automated VoIP provisioning gateway, internal firmware management vault, and GDPR data isolation engine.

---

## Repository Structure

- **`/MerlinSIP`**: Native Windows WPF softphone application (.NET 10).
- **`/ckm-handler`**: Backend server, Web Admin Portal (`/admin`), automated provisioning gateway, live SSE telemetry shell, and firmware repository.
  - [Full Server Documentation & Instruction Guide](ckm-handler/README.md)
- **`/docs`**: Architectural notes, licensing models, PBX integration guides, and security protocols.

---

## 1. CKM Handler Server Overview

`ckm-handler` runs as a high-performance provisioning and telemetry gateway for both softphones and physical hardware:

### Key Server Features
- **Physical IP Handset Auto-Provisioning**: Automated XML/CFG generation for **Yealink** (T3X, T4X, T5X, and Next-Gen T7X/T8X), **Snom**, **Grandstream**, **Poly**, **Fanvil**, **Gigaset**, and **Cisco**.
- **Internal Model Firmware Repository**: Automatically organizes and stores firmware binaries per device model (`data/firmware/{brand}/{model}/{filename}`), streamable via HTTP with byte ranges (`Accept-Ranges: bytes`) for Option 66 boots.
- **VoIP Router Deployment Profiles**: Pre-compiled mitigation scripts for **TP-Link** (Aginet VZ230v, EX220v, VX220-G2v, Archer AX1800, Omada SDN), **MikroTik RouterOS**, **Technicolor**, **Cisco IOS**, **DrayTek**, **Ubiquiti**, and **pfSense**.
- **Live SSE Device Connectivity Shell**: Real-time terminal streaming all device requests, registration handshakes, and firmware downloads.
- **Softphone 1-Click Provisioning**: Generates temporary 8-digit PINs and Customer Welcome Cards with deep-link auto-setup URLs (`merlinsip://provision?code=...`).
- **European GDPR Privacy Vault**: Strict separation between operational device records (`system.db`) and sensitive communications PII (`comms_vault.db`), with automated daily retention pruning and Article 17 Right-to-Erasure with SHA-256 cryptographic audit certificates.

---

## 2. Server Quickstart (Debian / Ubuntu VPS)

### Deployment Commands
```bash
# 1. Clone repository
git clone https://github.com/merlinthedev848/MSuite-SIP.git /root/MSuite-SIP
cd /root/MSuite-SIP

# 2. Deploy to production web directory
mkdir -p /var/www/ckm-handler
cp -r /root/MSuite-SIP/ckm-handler/* /var/www/ckm-handler/

# 3. Install & Build
cd /var/www/ckm-handler
npm install
npm run build

# 4. Start with PM2
pm2 start dist/server.js --name "ckm-handler"
pm2 save
pm2 startup
```

### Accessing the Web Admin Portal
Navigate to:
```text
https://handler.yourdomain.com/admin
```
- **Default Username**: `admin`
- **Default Password**: Configured in `/var/www/ckm-handler/.env`

For complete server instructions, endpoint references, DHCP Option 66 configurations, and firmware management, see the [CKM Handler Server Instruction Guide](ckm-handler/README.md).

---

## 3. Windows Desktop Softphone (`/MerlinSIP`)

### Self-Contained Windows Build
Publish a self-contained executable so the .NET runtime does not need to be installed on customer machines:

```powershell
dotnet publish .\MerlinSIP\MerlinSIP.csproj /p:PublishProfile=SelfContainedWinX64
```

The output is written to:
```text
MerlinSIP\bin\Release\net10.0-windows\win-x64\publish\
```

### What the Desktop App Includes
- Native WPF desktop shell for Windows.
- First-open license gate with cryptographic Ed25519 signature verification.
- 1-Click PIN provisioning: enter the 8-digit PIN from the CKM Handler admin dashboard to configure all SIP settings automatically.
- Native SIP REGISTER over UDP.
- Dialer workspace with call controls, recent calls, and local contact directory.
- Dynamic 10-minute config polling against CKM Handler (`/api/v1/config/sync`) for seamless PBX updates.

---

## 4. Updating the Server on VPS

When new updates are pushed to GitHub, run:

```bash
cd /root/MSuite-SIP
git pull origin beta/provisioning-and-contractor-licensing
cp -r /root/MSuite-SIP/ckm-handler/* /var/www/ckm-handler/
cd /var/www/ckm-handler
npm run build
pm2 restart ckm-handler
```

---

## License & Commercial IP Protection

Protected under commercial proprietary software licensing. See `LICENSE-COMMERCIAL-TEMPLATE.md` and `docs/` for licensing details.
