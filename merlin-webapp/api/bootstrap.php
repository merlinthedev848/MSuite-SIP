<?php
declare(strict_types=1);

const MERLIN_WEBAPP_VERSION = '1.3.1';
const MERLIN_APP_NAME = 'Merlin SIP Web';

// Whitelist of valid data files to prevent arbitrary file traversal/creation
const MERLIN_ALLOWED_DATA_FILES = [
    'settings.json',
    'contacts.json',
    'history.json',
    'recordings.json',
    'license.json'
];

// Handle CORS and preflight if running in web SAPI
if (php_sapi_name() !== 'cli') {
    if (!headers_sent()) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Max-Age: 86400');
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Returns the absolute path to the data storage directory.
 */
function merlin_data_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
}

/**
 * Validates and resolves the storage path for a given file name.
 */
function merlin_resolve_path(string $name): string
{
    $safeName = basename($name);
    if (!in_array($safeName, MERLIN_ALLOWED_DATA_FILES, true)) {
        merlin_json_response(['ok' => false, 'error' => 'Invalid data file specified.'], 400);
    }
    return merlin_data_dir() . DIRECTORY_SEPARATOR . $safeName;
}

/**
 * Sends a structured JSON HTTP response and terminates execution.
 */
function merlin_json_response(mixed $payload, int $status = 200): void
{
    if (php_sapi_name() === 'cli') {
        fwrite($status >= 400 ? STDERR : STDOUT, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
        exit($status >= 400 ? 1 : 0);
    }

    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
    }
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Verifies request authenticity against Cross-Site Request Forgery (CSRF).
 */
function merlin_verify_csrf(): void
{
    if (php_sapi_name() === 'cli') {
        return;
    }

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['GET', 'OPTIONS', 'HEAD'], true)) {
        return;
    }

    // Require custom app token header
    $customHeader = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (strtolower($customHeader) === 'merlin-webapp') {
        return;
    }

    // Fallback: Verify origin matches host
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '' && $host !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $serverHost = parse_url('http://' . $host, PHP_URL_HOST);
        if ($originHost === $serverHost || in_array($originHost, ['localhost', '127.0.0.1'], true)) {
            return;
        }
    }

    // Also check referer
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer !== '' && $host !== '') {
        $refererHost = parse_url($referer, PHP_URL_HOST);
        $serverHost = parse_url('http://' . $host, PHP_URL_HOST);
        if ($refererHost === $serverHost || in_array($refererHost, ['localhost', '127.0.0.1'], true)) {
            return;
        }
    }

    error_log("[Merlin Security] CSRF rejection: method={$method}, origin={$origin}, host={$host}, x-requested-with={$customHeader}");
    merlin_json_response(['ok' => false, 'error' => 'Cross-origin request blocked.'], 403);
}

merlin_verify_csrf();

/**
 * Reads a JSON file from the data directory with retry shared locking.
 */
function merlin_read_json(string $name, mixed $fallback): mixed
{
    $path = merlin_resolve_path($name);
    if (!is_file($path)) {
        return $fallback;
    }

    $handle = fopen($path, 'rb');
    if ($handle === false) {
        error_log("[Merlin Error] Failed to open {$path} for reading.");
        return $fallback;
    }

    $locked = false;
    for ($i = 0; $i < 5; $i++) {
        if (flock($handle, LOCK_SH | LOCK_NB)) {
            $locked = true;
            break;
        }
        usleep(10000); // 10ms
    }

    if (!$locked) {
        flock($handle, LOCK_SH);
    }

    $raw = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    if ($raw === false || trim($raw) === '') {
        return $fallback;
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("[Merlin Error] JSON decode error in {$path}: " . json_last_error_msg());
        return $fallback;
    }

    return $decoded;
}

/**
 * Atomically writes a JSON file with retry exclusive locking and error logging.
 */
function merlin_write_json(string $name, mixed $payload): void
{
    $path = merlin_resolve_path($name);
    $dir = dirname($path);

    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            error_log("[Merlin Error] Failed creating data directory {$dir}.");
            merlin_json_response(['ok' => false, 'error' => 'Unable to create data directory.'], 500);
        }
    }

    $encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        error_log('[Merlin Error] JSON encode failed: ' . json_last_error_msg());
        merlin_json_response(['ok' => false, 'error' => 'Unable to encode JSON data.'], 500);
    }

    $handle = fopen($path, 'c+b');
    if ($handle === false) {
        error_log("[Merlin Error] Unable to open {$path} for writing.");
        merlin_json_response(['ok' => false, 'error' => 'Unable to access storage file.'], 500);
    }

    $locked = false;
    for ($attempt = 0; $attempt < 10; $attempt++) {
        if (flock($handle, LOCK_EX | LOCK_NB)) {
            $locked = true;
            break;
        }
        usleep(20000); // 20ms
    }

    if (!$locked && !flock($handle, LOCK_EX)) {
        fclose($handle);
        error_log("[Merlin Error] Lock contention timeout on {$path}.");
        merlin_json_response(['ok' => false, 'error' => 'Storage lock contention timeout.'], 500);
    }

    ftruncate($handle, 0);
    rewind($handle);
    $written = fwrite($handle, $encoded . PHP_EOL);
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    if ($written === false) {
        error_log("[Merlin Error] Failed writing payload to {$path}.");
        merlin_json_response(['ok' => false, 'error' => 'Failed writing data payload.'], 500);
    }
}

/**
 * Reads and decodes JSON from the incoming request body.
 */
function merlin_request_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        merlin_json_response(['ok' => false, 'error' => 'Invalid JSON request body.'], 400);
    }

    return $decoded;
}

/**
 * Safely extracts and sanitizes a string from an input array.
 */
function merlin_string(array $data, string $key, int $max = 255): string
{
    $value = isset($data[$key]) ? trim((string) $data[$key]) : '';
    return substr($value, 0, $max);
}

/**
 * Probes a TCP socket connection with a specified timeout (in seconds).
 */
function merlin_probe_tcp(string $host, int $port, float $timeout = 2.5): array
{
    $start = microtime(true);
    $errno = 0;
    $errstr = '';
    $fp = @fsockopen($host, $port, $errno, $errstr, $timeout);
    $elapsed = round((microtime(true) - $start) * 1000, 2);

    if ($fp) {
        fclose($fp);
        return [
            'open' => true,
            'host' => $host,
            'port' => $port,
            'rtt_ms' => $elapsed,
            'error' => null,
        ];
    }

    return [
        'open' => false,
        'host' => $host,
        'port' => $port,
        'rtt_ms' => $elapsed,
        'error' => $errstr ?: "Connection timed out ({$errno})",
    ];
}
