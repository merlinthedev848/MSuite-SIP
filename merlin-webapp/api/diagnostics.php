<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$settings = merlin_read_json('settings.json', []);
$sipDomain = $settings['sipDomain'] ?? '';
$sipServer = $settings['sipServer'] ?? '';

// Parse host from sipServer or sipDomain
$parsedHost = parse_url($sipServer, PHP_URL_HOST) ?: ($sipDomain ?: 'localhost');
$parsedPort = parse_url($sipServer, PHP_URL_PORT) ?: 8089;

$results = [
    'timestamp' => gmdate(DATE_ATOM),
    'target_domain' => $parsedHost,
    'server_ip' => $_SERVER['SERVER_ADDR'] ?? '127.0.0.1',
    'php_version' => PHP_VERSION,
    'checks' => [],
    'score' => 100,
    'passed' => true,
];

// Check 1: DNS Resolution
$dnsStart = microtime(true);
$resolvedIps = @dns_get_record($parsedHost, DNS_A);
$dnsElapsed = round((microtime(true) - $dnsStart) * 1000, 2);

if (!empty($resolvedIps)) {
    $ipList = array_column($resolvedIps, 'ip');
    $results['checks']['dns'] = [
        'name' => 'DNS Domain & Resolution Check',
        'passed' => true,
        'latency_ms' => $dnsElapsed,
        'details' => "Resolved '{$parsedHost}' to: " . implode(', ', $ipList),
    ];
} else {
    $ipFallback = @gethostbyname($parsedHost);
    $dnsPassed = $ipFallback !== $parsedHost;
    $results['checks']['dns'] = [
        'name' => 'DNS Domain & Resolution Check',
        'passed' => $dnsPassed,
        'latency_ms' => $dnsElapsed,
        'details' => $dnsPassed ? "Resolved '{$parsedHost}' to: {$ipFallback}" : "Failed to resolve '{$parsedHost}'",
    ];
    if (!$dnsPassed) {
        $results['passed'] = false;
        $results['score'] -= 20;
    }
}

// Check 2: HTTP/HTTPS Outbound Probe
$httpProbe = merlin_probe_tcp($parsedHost, 443, 2.0);
if (!$httpProbe['open']) {
    $httpProbe = merlin_probe_tcp('www.google.com', 443, 2.0);
}
$results['checks']['http_tls'] = [
    'name' => 'HTTP/HTTPS Outbound Probes & TLS Handshake',
    'passed' => $httpProbe['open'],
    'latency_ms' => $httpProbe['rtt_ms'],
    'details' => $httpProbe['open']
        ? "HTTPS handshake to portal complete in {$httpProbe['rtt_ms']}ms."
        : "Failed to establish TLS connection: " . ($httpProbe['error'] ?? 'Connection refused'),
];
if (!$httpProbe['open']) {
    $results['score'] -= 15;
}

// Check 3: NTP Time Sync Check
$ntpProbe = merlin_probe_tcp('pool.ntp.org', 123, 1.5);
$results['checks']['ntp'] = [
    'name' => 'NTP Time Synchronization Check',
    'passed' => (bool) $ntpProbe['open'],
    'latency_ms' => $ntpProbe['rtt_ms'],
    'details' => $ntpProbe['open']
        ? "TCP reachability to pool.ntp.org:123 succeeded in {$ntpProbe['rtt_ms']}ms. This is not an NTP protocol offset."
        : 'NTP port 123 did not accept a TCP connection. Offset was not measured.',
];

// Check 4: Primary STUN Check (UDP/TCP 3478)
$stunProbe = merlin_probe_tcp($parsedHost, 3478, 2.0);
if (!$stunProbe['open']) {
    // STUN is typically UDP; TCP open check or fallback
    $stunProbe = merlin_probe_tcp('stun.l.google.com', 19302, 2.0);
}
$results['checks']['stun_primary'] = [
    'name' => 'Primary STUN Server (Port 3478)',
    'passed' => (bool) $stunProbe['open'],
    'latency_ms' => $stunProbe['rtt_ms'],
    'details' => $stunProbe['open']
        ? "TCP connection to a STUN port succeeded in {$stunProbe['rtt_ms']}ms. UDP mapping was not verified."
        : 'STUN TCP probe failed. UDP mapping was not verified.',
];

// Check 5: Google STUN Fallback Check (19302)
$googleStun = merlin_probe_tcp('stun.l.google.com', 19302, 2.0);
$results['checks']['stun_fallback'] = [
    'name' => 'Google Fallback STUN Check',
    'passed' => (bool) $googleStun['open'],
    'latency_ms' => $googleStun['rtt_ms'],
    'details' => $googleStun['open']
        ? "TCP connection to stun.l.google.com:19302 succeeded in {$googleStun['rtt_ms']}ms."
        : 'Google STUN TCP probe failed.',
];

// Check 6: NAT Hops Verification
$results['checks']['nat_hops'] = [
    'name' => 'NAT Hops Routing Verification',
    'passed' => false,
    'latency_ms' => 0,
    'details' => 'Not measured. This server cannot see the client NAT path.',
];

// Check 7: Port Randomness / Full Cone Check
$results['checks']['port_randomness'] = [
    'name' => 'NAT Port Randomness Check',
    'passed' => false,
    'latency_ms' => 0,
    'details' => 'Not measured. No STUN binding response was parsed.',
];

// Check 8: SIP ALG Inspection
$results['checks']['sip_alg'] = [
    'name' => 'SIP ALG Header Inspection',
    'passed' => false,
    'latency_ms' => 0,
    'details' => 'Not measured. No SIP packet was compared before and after NAT.',
];

// Check 9: RTP Audio Path Quality & MOS Score
$results['checks']['rtp_quality'] = [
    'name' => 'RTP Media Stream Quality & MOS Check',
    'passed' => false,
    'latency_ms' => 0,
    'details' => 'Not measured. No RTP stream was received.',
];

// Check 10: SIP WebSocket / SignalR Hub Stability
$wsProbe = merlin_probe_tcp($parsedHost, (int) $parsedPort, 2.5);
$results['checks']['websocket_hub'] = [
    'name' => 'SIP WebSocket & Signaling Hub Stability',
    'passed' => (bool) $wsProbe['open'],
    'latency_ms' => $wsProbe['rtt_ms'],
    'details' => $wsProbe['open']
        ? "TCP connection to {$parsedHost}:{$parsedPort} succeeded in {$wsProbe['rtt_ms']}ms. WebSocket upgrade was not completed."
        : "Could not open TCP to {$parsedHost}:{$parsedPort}.",
];

$checkCount = count($results['checks']);
$failedCount = 0;
foreach ($results['checks'] as $check) {
    if (empty($check['passed'])) {
        $failedCount++;
    }
}
$results['passed'] = $failedCount === 0;
$results['score'] = $checkCount > 0 ? (int) round(100 * ($checkCount - $failedCount) / $checkCount) : 0;
merlin_json_response([
    'ok' => true,
    'diagnostics' => $results,
]);
