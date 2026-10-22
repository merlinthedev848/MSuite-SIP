# Merlin SIP Web (v1.3.0)

**Merlin SIP Web** is an enterprise-grade, browser-based SIP softphone website and WebRTC client engineered specifically for **PHP Shared Hosting** environments (such as Enhance Control Panel, cPanel, DirectAdmin, Plesk, Apache, LiteSpeed, and Nginx) without requiring Node.js runtimes, Docker containers, or background daemons.

---

## Key Features

- **Enterprise Softphone Workspace**: Dual layout supporting full-screen enterprise multi-tab workspace and floating **Mini-Widget** softphone mode.
- **WebRTC Voice Calling**: Pure in-browser SIP over Secure WebSockets (`wss://`) powered by SIP.js with early media audio detection and local UK/US ringback synthesis.
- **Dual-Channel Call Recording**: Real-time WebRTC audio recording (mixing microphone + remote caller streams) with live recording timer, in-browser audio playback, and 1-click `.webm` / `.wav` file download.
- **Live Oscilloscope & Frequency Waveform Visualizer**: High-performance Web Audio API `AnalyserNode` rendering real-time animated frequency visualizer during active calls.
- **BLF Switchboard & Presence Wallboard**: Multi-extension Busy Lamp Field (BLF) dashboard with live status indicators (Available, Busy, Ringing, Away, Offline), 1-click Quick Dial, Direct Intercom (`*80`), Directed Pickup (`*8<ext>`), and Group Pickup (`*8`).
- **Visual Voicemail & PBX Feature Codes**: Voicemail Box (`*97`) with MWI status badge, Call Parking Lot (`*70`, Slots 71-73), Echo Audio Test (`*43`), Call Forwarding (`*72`/`*73`), and DND Toggle (`*78`).
- **Multi-Line Management**: Dual line support (Line 1 / Line 2) with line holding, call swapping, and 3-way conference audio bridge.
- **In-Call Controls & Audio Quality HUD**:
  - Microphone Mute / Unmute
  - Line Hold / Resume (SIP re-INVITE / hold SDP modifier)
  - Blind Transfer & Assisted (Attended) Transfer with consultation call leg
  - In-Call Recording toggle
  - DTMF tone keypad sending (RFC 2833 / SIP INFO)
  - Real-time **Mean Opinion Score (MOS)**, jitter, latency, and packet loss monitor.
- **Dual Authentication Modes**:
  - **Provisioning PIN Mode**: 8-digit auto-provisioning code resolution via accounts portal.
  - **Manual SIP Mode**: Custom PBX server (`wss://...`), domain, extension, auth user, and password.
- **CRM Integration API**: Supports `?dial=` / `?autocall=` URL query parameters and cross-window `postMessage` click-to-dial event integration for external CRMs (such as Merlin Spellcaster).
- **Commercial Licensing Gateway**: Validates Base64URL JSON Ed25519 license tokens (seats, expiry date, voice/transfer feature entitlements).
- **Directory & Speed Dial Management**: Local and server-synced corporate directory with search filter, speed dial favorites, and live BLF presence indicators.
- **Full Call History**: Inbound, Outbound, Missed, Declined, and Busy call logs with duration and double-click redial.
- **10-Step Interactive Network Diagnostic Suite**: Real-time socket probes testing DNS resolution, TLS handshakes, NTP time sync, STUN mapping, NAT topology, SIP ALG inspection, RTP MOS quality, and WSS keepalive stability.
- **Audio Device Management**: Input (microphone) and output (speaker / headset via `setSinkId`) device selector with built-in ringtone synthesizer and audio test tone generator.

---

## Shared Hosting Architecture

```text
merlin-webapp/
├── .htaccess               # MIME types, compression, Permissions-Policy, security headers
├── index.php               # Single-Page Application shell
├── preview.png             # UI preview screenshot
├── README.md               # Documentation and setup guide
├── api/
│   ├── bootstrap.php       # Core helpers, CORS, JSON responses, atomic file-locking
│   ├── settings.php        # GET/POST application & PBX settings
│   ├── contacts.php        # GET/POST directory & contacts CRUD
│   ├── history.php         # GET/POST/DELETE call history records
│   ├── provision.php       # 8-digit provisioning code resolver
│   ├── license.php         # Commercial license validator
│   ├── diagnostics.php     # Server-side socket & network test endpoint
│   └── manifest.php        # App metadata & PBX matrix discovery
├── assets/
│   ├── app.js              # Softphone controller, SIP engine & diagnostics
│   ├── tones.js            # Web Audio API DTMF, ringback & ringtone synthesizer
│   ├── styles.css          # Theme styling (dark side-rail & light dialer)
│   ├── CKMedia-Icon.png    # Brand logo
│   └── CKMedia-Icon.ico    # Favicon
└── data/
    ├── .htaccess           # Denies all direct HTTP access (security)
    ├── settings.json       # Non-secret PBX configuration
    ├── contacts.json       # Corporate contacts list
    └── history.json        # Softphone call logs
```

### Security & Privacy Design

- **Secret SIP Passwords**: Never stored on the shared hosting server disk. Passwords remain strictly in the user's browser `localStorage`.
- **Data Protection**: Direct HTTP access to `data/` is blocked by `data/.htaccess` (`Require all denied`).
- **File Locking**: Atomic writes with `LOCK_EX` and temporary file swap ensure zero file corruption under multi-user concurrency.

---

## Deployment Instructions

1. **Upload**: Upload the contents of `merlin-webapp` to your shared hosting document root (e.g. `public_html/phone` or `subdomain.example.com`).
2. **HTTPS**: Ensure SSL/TLS is active (browsers require HTTPS for WebRTC microphone access).
3. **Open Website**: Open `https://your-domain.com/` in any modern web browser (Chrome, Edge, Firefox, Safari).
4. **Grant Audio**: Allow microphone access when prompted.
5. **Authenticate**:
   - Enter your **8-digit Provisioning Code**, OR
   - Switch to **Manual SIP Setup** and enter your PBX WebSocket server (e.g. `wss://your-sip-server:8089/ws`), domain, extension, and password.

---

## PBX Integration Matrix

| PBX Platform | Transport | WebRTC Port | Notes |
| :--- | :--- | :--- | :--- |
| **Yeastar S-Series (S100/S50)** | WSS / WebRTC Bridge | `8089` / TLS Gateway | Full calling, blind/attended transfer, DTMF, voicemail `*97`. |
| **Yeastar P-Series (P550+)** | Native WSS | `8089` / `5061` | Native WebRTC client integration, BLF, queue support. |
| **FreePBX / Asterisk** | PJSIP WebSockets | `8089` | Requires `webrtc=yes`, `transport=wss` in PJSIP extension settings. |
| **Kamailio / OpenSIPS** | RFC 7118 WSS | `443` / `8089` | Standard SIP over WebSocket proxying with RTPengine. |

---

## License & Support

Developed by **CK Media Services**. Commercial softphone licensing available for corporate deployments.


