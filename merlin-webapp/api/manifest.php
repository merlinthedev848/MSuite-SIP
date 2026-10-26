<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

merlin_json_response([
    'ok' => true,
    'name' => MERLIN_APP_NAME,
    'short_name' => 'Merlin SIP',
    'version' => MERLIN_WEBAPP_VERSION,
    'description' => 'Enterprise Web Softphone and PBX Client for Shared Hosting and WebRTC Calling',
    'runtime' => 'PHP ' . PHP_VERSION . ' + Browser WebRTC SIP.js',
    'developer' => 'CK Media Services',
    'pbx_compatibility' => [
        'yeastar_s_series' => [
            'name' => 'Yeastar S-Series (S100 / S50 / S20)',
            'sip_transport' => 'WSS / WebRTC gateway or SIP over TLS/UDP bridge',
            'features' => ['calls', 'hold', 'blind_transfer', 'attended_transfer', 'dtmf', 'blf_presence', 'voicemail'],
        ],
        'yeastar_p_series' => [
            'name' => 'Yeastar P-Series (P550 / P560 / P570 / Cloud)',
            'sip_transport' => 'Native WebRTC / WSS',
            'features' => ['calls', 'hold', 'transfer', 'conference', 'blf', 'queues', 'cdr'],
        ],
        'freepbx' => [
            'name' => 'FreePBX / Asterisk (v16 - v21+)',
            'sip_transport' => 'PJSIP WebRTC (WSS Port 8089)',
            'features' => ['calls', 'hold', 'transfer', 'dtmf', 'ami_events', 'voicemail_97'],
        ],
        'generic_sip' => [
            'name' => 'Generic SIP / Kamailio / OpenSIPS / FreeSWITCH',
            'sip_transport' => 'RFC 7118 WebSocket (WSS)',
            'features' => ['calls', 'hold', 'transfer', 'dtmf', 'webrtc_media'],
        ],
    ],
    'endpoints' => [
        'settings' => 'api/settings.php',
        'contacts' => 'api/contacts.php',
        'history' => 'api/history.php',
        'provision' => 'api/provision.php',
        'license' => 'api/license.php',
        'recordings' => 'api/recordings.php',
        'diagnostics' => 'api/diagnostics.php',
    ],
]);
