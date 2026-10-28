# CKM Handler (`handler.domain.tld`)
### Unified Communications, Provisioning Gateway & GDPR Vault for MerlinSIP

`ckm-handler` is a unified, versatile server packaged in a single Docker container that integrates:
1. **Real-Time Data & Media Engine**: Sub-50ms WhatsApp-speed chat via Socket.IO, audio voice notes, file attachments, and delivery ACKs.
2. **Softphone Auto-Provisioning & Config Sync**: 8-digit PIN lookup (`/sip/provision/:code`) and dynamic 10-minute config sync (`/api/v1/config/sync`).
3. **Physical Hardware Deskphone Provisioning**: Automatic XML/CFG generation for Yealink, Fanvil, Grandstream, and Poly handsets based on MAC address (`/provision/:mac.cfg`).
4. **Corporate Directory / Remote Phonebook**: Central address book served in Yealink XML, Fanvil XML, Grandstream XML, and JSON format (`/phonebook/yealink.xml`, `/api/v1/contacts`).
5. **GDPR Data Isolation & Retention Vault**: Strict separation between operational device data (`system.db`) and sensitive communications PII (`comms_vault.db`), with automated daily retention pruning, Right-to-Erasure (Article 17) with SHA-256 cryptographic audit certificates, and Right-to-Portability (Article 20) data exports.
6. **Web Admin Portal (`/admin`)**: Browser-based management dashboard for monitoring extensions, generating softphone PINs, binding handset MACs, updating PBX gateways, and managing GDPR policies.

---

## 1. Quickstart (Docker Deployment)

Deploy in seconds with Docker Compose:

```bash
git clone https://github.com/merlinthedev848/MSuite-SIP.git
cd MSuite-SIP/ckm-handler
docker compose up -d --build
```

Access the Web Admin Portal at:
```text
http://localhost:3000/admin   (or https://handler.domain.tld/admin)
```
- **Default Username**: `admin`
- **Default Password**: `ChangeMeImmediately123!` (configured in `docker-compose.yml`)

---

## 2. Handset & Endpoint Provisioning Guide

### A. Softphones (MerlinSIP Desktop, Mac, iOS, Android, Web)
1. In the Admin Portal under **Extensions & PINs**, click **+ New Extension** and enter Extension `101`, Name, and SIP Password.
2. Click **Generate PIN**. An 8-digit numeric code (e.g. `48291044`) is generated with a 72-hour expiration.
3. On the softphone welcome screen, the user enters `48291044`. The app pulls full PBX connection details and connects immediately.
4. Every 10 minutes, softphones poll `/api/v1/config/sync`. If you update your PBX host or ports in the admin dashboard, all active softphones update seamlessly.

### B. Physical Deskphones (Yealink, Fanvil, Grandstream)
1. Set **DHCP Option 66** on your local office router (or type into the phone's web UI under Auto-Provisioning Server) to:
   ```text
   https://handler.domain.tld/provision/
   ```
2. In the Admin Portal under **Physical Handsets**, click **+ Register Physical Handset**:
   - **MAC Address**: `001565A1B2C3` (12 hex digits from the phone's barcode sticker)
   - **Extension**: Select the assigned extension (e.g. `101`)
   - **Brand**: `yealink`, `fanvil`, or `grandstream`
3. Reboot the physical phone. The phone automatically requests:
   - Yealink: `GET /provision/001565a1b2c3.cfg`
   - Fanvil: `GET /provision/00a0bcf1e2d3.xml`
   - Grandstream: `GET /provision/cfg000b82f1e2d3.xml`
4. `merlin-handler` renders the manufacturer-compliant configuration dynamically. The phone registers to the PBX and pulls the corporate phonebook automatically.

---

## 3. GDPR Data Isolation Architecture

To ensure total compliance with European GDPR privacy requirements:

| Database File | Scope | Contains PII? | Retention & Purge Rules |
|---|---|---|---|
| `/data/system.db` | Operational Infrastructure | **NO** | Stores PBX IPs, ports, device MACs, 8-digit temporary PINs, and license tokens. Safe for device boots and telemetry. |
| `/data/vault/comms_vault.db` | User Communications | **YES** | Stores chat messages, recipient IDs, address book entries, and call logs. Protected with row-level segregation. |
| `/data/vault/uploads/` | File Media Vault | **YES** | Stores voice notes, attachments, and audio recordings under cryptographic UUID filenames with non-guessable paths. |

### Automated Retention Lifecycle
- Configured in Admin Portal > GDPR Vault.
- Default retention: **90 days**.
- Every 24 hours, the background retention daemon automatically deletes expired rows and unlinks physical attachment files from disk.

### Right to Erasure (Article 17)
- In the Admin Portal, entering an extension and clicking **Execute Right to Erasure**:
  1. Purges all chat messages sent by or to that extension.
  2. Unlinks and deletes all uploaded media files from disk.
  3. Purges their directory entry.
  4. Generates a verifiable SHA-256 Cryptographic Audit Certificate saved in `gdpr_audit_logs`.

---

## 4. REST API & Endpoint Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/health` | GET | Uptime and health probe |
| `POST /sip/provision/:code` | POST | Softphone 8-digit PIN provisioning |
| `GET /api/v1/config/sync` | GET | 10-minute dynamic softphone configuration sync |
| `GET /provision/:filename` | GET | Dynamic XML/CFG physical deskphone provisioning |
| `GET /phonebook/yealink.xml` | GET | Yealink XML Corporate Phonebook |
| `GET /phonebook/fanvil.xml` | GET | Fanvil XML Corporate Phonebook |
| `GET /phonebook/grandstream.xml` | GET | Grandstream XML Corporate Phonebook |
| `GET /api/v1/contacts` | GET | JSON Corporate Phonebook for Softphones |
| `POST /files/upload` | POST | Multipart upload for chat attachments and voice notes |
| `GET /files/:fileId` | GET | Secure media streaming with proper MIME types |
| `DELETE /api/v1/gdpr/user/:ext` | DELETE | GDPR Article 17 Right-to-Erasure |
| `GET /api/v1/gdpr/user/:ext/export` | GET | GDPR Article 20 Data Portability Export |
| `GET /admin` | GET | Web Admin Portal UI |
