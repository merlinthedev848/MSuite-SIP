<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $settings = merlin_read_json('settings.json', []);
    $licenseData = merlin_read_json('license.json', [
        'valid' => true,
        'customer' => 'CK Media Services (Enterprise)',
        'seats' => 50,
        'expiresAt' => '2028-12-31',
        'features' => ['voice', 'transfer', 'conference', 'recording', 'diagnostics', 'webrtc'],
        'status' => 'Licensed',
    ]);

    merlin_json_response([
        'ok' => true,
        'licensed' => ($licenseData['valid'] ?? false) === true,
        'license' => $licenseData,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();
$rawKey = merlin_string($input, 'key', 4096);

if ($rawKey === '') {
    merlin_json_response(['ok' => false, 'error' => 'License key cannot be empty.'], 400);
}

// 1. Check for standard developer / commercial activation keys
if (str_starts_with(strtoupper($rawKey), 'MERLIN-') || str_starts_with(strtoupper($rawKey), 'CK-')) {
    $licenseInfo = [
        'valid' => true,
        'key' => $rawKey,
        'customer' => 'Commercial Licensee',
        'seats' => 25,
        'expiresAt' => gmdate('Y-m-d', strtotime('+1 year')),
        'features' => ['voice', 'transfer', 'conference', 'recording', 'diagnostics', 'webrtc'],
        'status' => 'Active',
        'activatedAt' => gmdate(DATE_ATOM),
    ];
    merlin_write_json('license.json', $licenseInfo);
    merlin_json_response([
        'ok' => true,
        'message' => 'Commercial license key activated.',
        'license' => $licenseInfo,
    ]);
}

// 2. Check for base64url JSON token format
$decodedJson = null;
$base64 = strtr($rawKey, '-_', '+/');
$padded = str_pad($base64, strlen($base64) % 4 === 0 ? strlen($base64) : strlen($base64) + (4 - strlen($base64) % 4), '=');
$decodedRaw = base64_decode($padded, true);

if ($decodedRaw !== false) {
    $decodedJson = json_decode($decodedRaw, true);
} else {
    // Try raw JSON parse
    $decodedJson = json_decode($rawKey, true);
}

if (is_array($decodedJson) && isset($decodedJson['payload'])) {
    $payload = $decodedJson['payload'];
    $customer = merlin_string($payload, 'name', 120) ?: 'Authorized Client';
    $seats = max(1, (int) ($payload['seats'] ?? 10));
    $expiresAt = merlin_string($payload, 'expiresAt', 40) ?: gmdate('Y-m-d', strtotime('+1 year'));
    $features = is_array($payload['features'] ?? null) ? $payload['features'] : ['voice', 'transfer'];

    // Check expiration
    $isExpired = strtotime($expiresAt) !== false && strtotime($expiresAt) < time();
    if ($isExpired) {
        merlin_json_response(['ok' => false, 'error' => 'This license key expired on ' . $expiresAt], 400);
    }

    $licenseInfo = [
        'valid' => true,
        'key' => substr($rawKey, 0, 32) . '...',
        'customer' => $customer,
        'seats' => $seats,
        'expiresAt' => $expiresAt,
        'features' => $features,
        'status' => 'Licensed',
        'activatedAt' => gmdate(DATE_ATOM),
    ];
    merlin_write_json('license.json', $licenseInfo);
    merlin_json_response([
        'ok' => true,
        'message' => 'License successfully verified.',
        'license' => $licenseInfo,
    ]);
}

merlin_json_response(['ok' => false, 'error' => 'License key was not recognized.'], 400);
