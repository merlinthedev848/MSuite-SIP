# Contractor Whitelabel / Buyout Licensing & Dynamic Provisioning Sync Specification

## Overview

MerlinSIP Softphone supports two distinct operating tiers:

1. **Managed Service Tier (Default / Standard Accounts)**
   - End users authenticate quickly using a one-time 8-digit auto-provisioning PIN code.
   - Softphone automatically connects to the managed PBX (`pbx.chriskendall.media:5060`) and the managed chat/file handler (`https://handler.chriskendall.media`).
   - The desktop client runs an asynchronous, non-blocking background sync every 10 minutes polling `https://accounts.chriskendall.media/api/v1/config/sync`. If central endpoints, ports, or transports change, client configs update dynamically and seamlessly without user intervention.
   - Offline-First: If the provisioning server is down, unreachable, or times out, the client ignores the failure and continues normal voice and messaging operations without interruption.

2. **Contractor Buyout / Whitelabel Tier (`BUYOUT-...` or `PR-...`)**
   - Enables independent contractors and white-label clients to purchase and run the softphone software for their own businesses.
   - **8-Digit Provisioning Code Disabled & Hidden**: The central provisioning PIN input card is completely removed from the welcome and settings screens. Contractors cannot trigger provisioning requests against `accounts.chriskendall.media`.
   - **Central Config Sync Polling Disabled**: The 10-minute periodic sync strictly checks `AllowsCustomSipEndpoint`. If true, polling is completely skipped so contractor clients never report or ping the central server.
   - **Self-Hosted PBX & Data Handler Support**: Contractors configure their own custom SIP Server / Domain, SIP Port (UDP/TCP/TLS), and custom Data Handler URL (for real-time chat and file storage).

---

## Technical Implementation Details

### Client Configuration Rules

| Feature | Standard Managed License | Contractor Buyout (`BUYOUT-*`, `PR-*`) |
|---|---|---|
| **8-Digit Auto-Provisioning PIN** | Enabled (`SetupCodeCard` visible) | **Disabled & Hidden** (`SetupCodeCard.Visibility = Collapsed`) |
| **Manual SIP Endpoint Settings** | Locked to `pbx.chriskendall.media` | **Editable** (Custom Server, Port, Transport) |
| **Data Handler Settings** | Locked to `https://handler.chriskendall.media` | **Editable** (`PrivateDataHandlerTextBox` visible) |
| **10-Minute Remote Config Sync** | Active (Polls `/api/v1/config/sync`) | **Disabled** (Bypasses all sync network calls) |
| **Offline Fault Tolerance** | Fully autonomous, cached locally | Fully autonomous, cached locally |

---

## Central Provisioning & Dynamic Config Sync Server Spec

### Endpoint: `GET /api/v1/config/sync`

- **Purpose**: Polled every 10 minutes by managed clients to retrieve authoritative endpoint URLs and configuration updates.
- **Headers**:
  - `User-Agent: MerlinSIP/{version}`
  - `Accept: application/json`

#### Expected Response Format (JSON):
```json
{
  "version": "1.3.9.3",
  "sip": {
    "server": "pbx.chriskendall.media",
    "port": 5060,
    "transport": "UDP"
  },
  "data_handler": {
    "socket_url": "https://handler.chriskendall.media",
    "upload_endpoint": "https://handler.chriskendall.media/files/upload"
  },
  "features": {
    "chat_enabled": true,
    "video_calls_enabled": true
  }
}
```

### Reference Implementation: PHP (`sync.php`)
```php
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

$response = [
    'version' => '1.3.9.3',
    'sip' => [
        'server' => 'pbx.chriskendall.media',
        'port' => 5060,
        'transport' => 'UDP'
    ],
    'data_handler' => [
        'socket_url' => 'https://handler.chriskendall.media',
        'upload_endpoint' => 'https://handler.chriskendall.media/files/upload'
    ],
    'features' => [
        'chat_enabled' => true,
        'video_calls_enabled' => true
    ]
];

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
```

### Reference Implementation: Express / Node.js
```javascript
app.get('/api/v1/config/sync', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    version: '1.3.9.3',
    sip: {
      server: 'pbx.chriskendall.media',
      port: 5060,
      transport: 'UDP'
    },
    data_handler: {
      socket_url: 'https://handler.chriskendall.media',
      upload_endpoint: 'https://handler.chriskendall.media/files/upload'
    },
    features: {
      chat_enabled: true,
      video_calls_enabled: true
    }
  });
});
```

---

## Contractor Self-Hosting Checklist

Contractors deploying their own private infrastructure must perform the following:
1. **PBX Server**: Deploy Asterisk, FreePBX, or Kamailio with standard SIP credentials on custom host/port (e.g. `sip.contractor.com:5060`).
2. **Data Handler Server**: Deploy `voip-chat-backend` (`better-sqlite3`, Express, Socket.io) on a self-hosted node (e.g. `https://chat.contractor.com`).
3. **Softphone License**: Issue or install client with key prefix `BUYOUT-` or `PR-`.
4. **Initial Configuration**: In MerlinSIP Settings > Private PBX Server Settings, fill in:
   - SIP Server / Domain
   - SIP Port & Transport
   - Data Handler URL
5. Save settings. The client will immediately switch communication channels and will never touch the central managed server.
