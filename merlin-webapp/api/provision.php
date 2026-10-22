<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();
$rawCode = merlin_string($input, 'code', 32);
$cleanedCode = preg_replace('/[^0-9]/', '', $rawCode);

if (strlen($cleanedCode) !== 8) {
    merlin_json_response([
        'ok' => false,
        'error' => 'Enter a valid 8-digit provisioning code.',
    ], 400);
}

// Provisioning endpoint URLs matching Merlin SIP desktop client (20 endpoint templates)
$urlTemplates = [
    'https://accounts.chriskendall.media/sip/register/{code}',
    'https://accounts.chriskendall.media/index.php/sip/register/{code}',
    'https://accounts.chriskendall.media/sip/device/{code}',
    'https://accounts.chriskendall.media/index.php/sip/device/{code}',
    'https://accounts.chriskendall.media/sip/autoprovision/{code}',
    'https://accounts.chriskendall.media/index.php/sip/autoprovision/{code}',
    'https://accounts.chriskendall.media/sip/details/{code}',
    'https://accounts.chriskendall.media/index.php/sip/details/{code}',
    'https://accounts.chriskendall.media/sip/provision/{code}',
    'https://accounts.chriskendall.media/index.php/sip/provision/{code}',
    'https://accounts.chriskendall.media/sip/details',
    'https://accounts.chriskendall.media/index.php/sip/details',
    'https://accounts.chriskendall.media/sip/autoprovision/details',
    'https://accounts.chriskendall.media/index.php/sip/autoprovision/details',
    'https://accounts.chriskendall.media/sip/provision/details',
    'https://accounts.chriskendall.media/index.php/sip/provision/details',
    'https://accounts.chriskendall.media/sip/autoprovision',
    'https://accounts.chriskendall.media/index.php/sip/autoprovision',
    'https://accounts.chriskendall.media/sip/provision',
    'https://accounts.chriskendall.media/index.php/sip/provision'
];

$provisioned = null;
$lastError = 'The 8-digit provisioning code could not be verified by the PBX accounts server.';
$payload = (string) json_encode(['code' => $cleanedCode]);
$hasCurl = function_exists('curl_init');

// Attempt live provisioning against PBX accounts server
foreach ($urlTemplates as $template) {
    $url = str_replace('{code}', $cleanedCode, $template);
    $response = false;
    $httpCode = 0;

    if ($hasCurl) {
        $ch = curl_init($url);
        if ($ch === false) {
            continue;
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'User-Agent: MerlinSIP-Web/' . MERLIN_WEBAPP_VERSION,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAccept: application/json\r\nUser-Agent: MerlinSIP-Web/" . MERLIN_WEBAPP_VERSION . "\r\n",
                'content' => $payload,
                'timeout' => 6,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $response = @file_get_contents($url, false, $context);
        if (isset($http_response_header[0]) && preg_match('/HTTP\/\S+\s+(\d{3})/', $http_response_header[0], $m)) {
            $httpCode = (int) $m[1];
        }
    }

    if ($response && ($httpCode === 200 || $httpCode === 201)) {
        $decoded = json_decode((string) $response, true);
        if (is_array($decoded) && (!empty($decoded['success']) || !empty($decoded['sip']) || !empty($decoded['extension']))) {
            $sip = $decoded['sip'] ?? $decoded;
            $ext = (string) ($sip['extension'] ?? $sip['ext'] ?? $sip['user'] ?? '');
            $auth = (string) ($sip['auth_name'] ?? $sip['username'] ?? $sip['authUsername'] ?? $ext);
            $pwd = (string) ($sip['sip_password'] ?? $sip['password'] ?? $sip['secret'] ?? '');
            $server = (string) ($sip['server_wss'] ?? $sip['websocket_url'] ?? $sip['sipServer'] ?? '');
            $domain = (string) ($sip['domain'] ?? $sip['sipDomain'] ?? '');
            $display = (string) ($sip['display_name'] ?? $sip['displayName'] ?? ('Ext ' . $ext));

            if ($ext !== '' && $pwd !== '') {
                $provisioned = [
                    'extension' => $ext,
                    'authUsername' => $auth,
                    'password' => $pwd,
                    'sipServer' => $server,
                    'sipDomain' => $domain,
                    'displayName' => $display,
                ];
                break;
            }
        } elseif (is_array($decoded) && !empty($decoded['message'])) {
            $lastError = (string) $decoded['message'];
        }
    }
}

// If upstream accounts server verified credentials, save configuration
if ($provisioned) {
    $settings = merlin_read_json('settings.json', []);
    $settings['extension'] = $provisioned['extension'];
    $settings['authUsername'] = $provisioned['authUsername'];
    $settings['sipServer'] = $provisioned['sipServer'];
    $settings['sipDomain'] = $provisioned['sipDomain'];
    $settings['displayName'] = $provisioned['displayName'];
    merlin_write_json('settings.json', $settings);

    merlin_json_response([
        'ok' => true,
        'message' => 'Account successfully provisioned.',
        'config' => [
            'extension' => $provisioned['extension'],
            'authUsername' => $provisioned['authUsername'],
            'password' => $provisioned['password'],
            'sipServer' => $provisioned['sipServer'],
            'sipDomain' => $provisioned['sipDomain'],
            'displayName' => $provisioned['displayName'],
        ],
    ]);
}

// If provisioning failed, return clear error without saving fake credentials
merlin_json_response([
    'ok' => false,
    'error' => $lastError . ' Please verify your code or configure your SIP extension manually in Settings.',
], 404);
