<?php
declare(strict_types=1);

const MERLIN_WEBAPP_VERSION = '1.2.2';
const MERLIN_APP_NAME = 'Merlin SIP Web';

// Handle CORS headers for API requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/**
 * Returns the absolute path to the data storage directory.
 */
function merlin_data_dir(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
}

/**
 * Sends a structured JSON HTTP response and terminates execution.
 */
function merlin_json_response(mixed $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Reads a JSON file from the data directory with file locking and error fallback.
 */
function merlin_read_json(string $name, mixed $fallback): mixed
{
    $safeName = basename($name);
    $path = merlin_data_dir() . DIRECTORY_SEPARATOR . $safeName;
    if (!is_file($path)) {
        return $fallback;
    }

    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return $fallback;
    }

    @flock($handle, LOCK_SH);
    $raw = stream_get_contents($handle);
    @flock($handle, LOCK_UN);
    @fclose($handle);

    if ($raw === false || trim($raw) === '') {
        return $fallback;
    }

    $decoded = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

/**
 * Writes a JSON file atomically with exclusive locking.
 */
function merlin_write_json(string $name, mixed $payload): void
{
    $safeName = basename($name);
    $dir = merlin_data_dir();
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
            merlin_json_response(['ok' => false, 'error' => 'Unable to create data directory.'], 500);
        }
    }

    $path = $dir . DIRECTORY_SEPARATOR . $safeName;
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        merlin_json_response(['ok' => false, 'error' => 'Unable to encode JSON data.'], 500);
    }

    if (@file_put_contents($tmp, $encoded . PHP_EOL, LOCK_EX) === false) {
        @unlink($tmp);
        merlin_json_response(['ok' => false, 'error' => 'Unable to write temporary data file.'], 500);
    }

    if (!@rename($tmp, $path)) {
        // Fallback for Windows file lock replacement
        if (@copy($tmp, $path)) {
            @unlink($tmp);
        } else {
            @unlink($tmp);
            merlin_json_response(['ok' => false, 'error' => 'Unable to save final data file.'], 500);
        }
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
        @fclose($fp);
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
