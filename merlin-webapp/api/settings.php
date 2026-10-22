<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$defaults = [
    'sipServer' => '',
    'sipDomain' => '',
    'extension' => '',
    'authUsername' => '',
    'displayName' => 'Merlin SIP Web',
    'sipTransport' => 'WSS',
    'dndMode' => 'off',
    'declineAction' => 'busy',
    'ringtone' => 'classic',
    'autoRegister' => true,
    'sipAlgCompat' => false,
    'combineContacts' => true,
    'transferMode' => 'blind',
    'audioInput' => 'default',
    'audioOutput' => 'default',
    'featureCodes' => [
        'voicemail' => '*97',
        'dndToggle' => '*78',
        'echoTest' => '*43',
        'callPickup' => '*8',
    ],
    'licensed' => true,
    'licenseKey' => 'MERLIN-COMMERCIAL-UNLIMITED',
];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stored = merlin_read_json('settings.json', []);
    $merged = array_replace_recursive($defaults, is_array($stored) ? $stored : []);
    merlin_json_response([
        'ok' => true,
        'app' => MERLIN_APP_NAME,
        'version' => MERLIN_WEBAPP_VERSION,
        'settings' => $merged,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();
$sipServer = merlin_string($input, 'sipServer', 300);

if ($sipServer !== '' && !preg_match('/^wss?:\/\/[a-z0-9_.:\/-]+$/i', $sipServer)) {
    merlin_json_response(['ok' => false, 'error' => 'SIP server must be a valid WebSocket URL (e.g. wss://your-sip-server:8089/ws).'], 400);
}

$sipDomain = merlin_string($input, 'sipDomain', 180);
if ($sipDomain === '' && $sipServer !== '') {
    $sipDomain = (string) (parse_url($sipServer, PHP_URL_HOST) ?: '');
}

$settings = [
    'sipServer' => $sipServer,
    'sipDomain' => $sipDomain,
    'extension' => merlin_string($input, 'extension', 80),
    'authUsername' => merlin_string($input, 'authUsername', 80),
    'displayName' => merlin_string($input, 'displayName', 120) ?: 'Merlin SIP Web',
    'sipTransport' => in_array($input['sipTransport'] ?? '', ['WSS', 'UDP', 'TCP', 'TLS'], true) ? $input['sipTransport'] : 'WSS',
    'dndMode' => in_array($input['dndMode'] ?? '', ['off', 'on', 'silent'], true) ? $input['dndMode'] : 'off',
    'declineAction' => in_array($input['declineAction'] ?? '', ['busy', 'decline'], true) ? $input['declineAction'] : 'busy',
    'ringtone' => merlin_string($input, 'ringtone', 60) ?: 'classic',
    'autoRegister' => !empty($input['autoRegister']),
    'sipAlgCompat' => !empty($input['sipAlgCompat']),
    'combineContacts' => isset($input['combineContacts']) ? (bool) $input['combineContacts'] : true,
    'transferMode' => in_array($input['transferMode'] ?? '', ['blind', 'assisted'], true) ? $input['transferMode'] : 'blind',
    'audioInput' => merlin_string($input, 'audioInput', 120) ?: 'default',
    'audioOutput' => merlin_string($input, 'audioOutput', 120) ?: 'default',
    'featureCodes' => is_array($input['featureCodes'] ?? null) ? [
        'voicemail' => merlin_string($input['featureCodes'], 'voicemail', 20) ?: '*97',
        'dndToggle' => merlin_string($input['featureCodes'], 'dndToggle', 20) ?: '*78',
        'echoTest' => merlin_string($input['featureCodes'], 'echoTest', 20) ?: '*43',
        'callPickup' => merlin_string($input['featureCodes'], 'callPickup', 20) ?: '*8',
    ] : $defaults['featureCodes'],
    'licensed' => true,
    'licenseKey' => merlin_string($input, 'licenseKey', 120) ?: 'MERLIN-COMMERCIAL-UNLIMITED',
];

merlin_write_json('settings.json', $settings);
merlin_json_response(['ok' => true, 'settings' => $settings]);
