<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

const MERLIN_RECORDING_MAX_BYTES = 8388608;

function merlin_recordings_dir(): string
{
    $dir = merlin_data_dir() . DIRECTORY_SEPARATOR . 'recordings';
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        merlin_json_response(['ok' => false, 'error' => 'Could not create the recordings folder.'], 500);
    }
    return $dir;
}

function merlin_recording_id(string $id): string
{
    $clean = preg_replace('/[^a-zA-Z0-9_-]/', '', $id) ?? '';
    return strlen($clean) >= 4 ? $clean : '';
}

function merlin_recording_path(string $id): string
{
    return merlin_recordings_dir() . DIRECTORY_SEPARATOR . $id . '.webm';
}

function merlin_store_audio(string $id, string $bytes): bool
{
    if ($bytes === '' || strlen($bytes) > MERLIN_RECORDING_MAX_BYTES) {
        return false;
    }
    $path = merlin_recording_path($id);
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, $bytes, LOCK_EX) === false) {
        return false;
    }
    return rename($tmp, $path);
}

function merlin_delete_audio(string $id): void
{
    $path = merlin_recording_path($id);
    if (is_file($path)) {
        unlink($path);
    }
}

function merlin_public_recordings(array $items): array
{
    $out = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = merlin_recording_id(merlin_string($item, 'id', 80));
        if ($id === '') {
            continue;
        }
        unset($item['audioBase64'], $item['blobUrl']);
        $item['id'] = $id;
        if (is_file(merlin_recording_path($id))) {
            $item['url'] = 'api/recordings.php?id=' . rawurlencode($id);
            $item['size'] = filesize(merlin_recording_path($id)) ?: (int) ($item['size'] ?? 0);
        }
        $out[] = $item;
    }
    return $out;
}

function merlin_normalise_entry(array $item): ?array
{
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 80)) ?? '';
    if ($number === '') {
        return null;
    }
    $id = merlin_recording_id(merlin_string($item, 'id', 80));
    if ($id === '') {
        $id = 'rec-' . bin2hex(random_bytes(6));
    }
    return [
        'id' => $id,
        'number' => $number,
        'name' => merlin_string($item, 'name', 120) ?: 'Unknown',
        'direction' => in_array(($item['direction'] ?? ''), ['Inbound', 'Outbound'], true) ? $item['direction'] : 'Outbound',
        'duration' => max(0, (int) ($item['duration'] ?? 0)),
        'timestamp' => merlin_string($item, 'timestamp', 40) ?: gmdate(DATE_ATOM),
        'format' => merlin_string($item, 'format', 40) ?: 'audio/webm',
        'size' => max(0, (int) ($item['size'] ?? 0)),
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestedId = merlin_recording_id((string) ($_GET['id'] ?? ''));

if ($method === 'GET' && $requestedId !== '') {
    $path = merlin_recording_path($requestedId);
    if (!is_file($path)) {
        merlin_json_response(['ok' => false, 'error' => 'Recording audio was not found.'], 404);
    }
    if (php_sapi_name() !== 'cli') {
        header('Content-Type: audio/webm');
        header('Content-Length: ' . (string) filesize($path));
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
    }
    readfile($path);
    exit;
}

if ($method === 'GET') {
    $stored = merlin_read_json('recordings.json', []);
    if (!is_array($stored)) {
        $stored = [];
    }
    merlin_json_response([
        'ok' => true,
        'recordings' => merlin_public_recordings($stored)
    ]);
}

if ($method === 'DELETE') {
    $stored = merlin_read_json('recordings.json', []);
    if (is_array($stored)) {
        foreach ($stored as $item) {
            if (is_array($item)) {
                $id = merlin_recording_id(merlin_string($item, 'id', 80));
                if ($id !== '') {
                    merlin_delete_audio($id);
                }
            }
        }
    }
    merlin_write_json('recordings.json', []);
    merlin_json_response(['ok' => true, 'message' => 'Recordings cleared.', 'recordings' => []]);
}

if ($method !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();

if (isset($input['deleteId'])) {
    $id = merlin_recording_id(merlin_string($input, 'deleteId', 80));
    if ($id === '') {
        merlin_json_response(['ok' => false, 'error' => 'A recording id is required.'], 400);
    }
    $stored = merlin_read_json('recordings.json', []);
    if (!is_array($stored)) {
        $stored = [];
    }
    $kept = [];
    foreach ($stored as $item) {
        if (!is_array($item)) {
            continue;
        }
        $itemId = merlin_recording_id(merlin_string($item, 'id', 80));
        if ($itemId === $id) {
            continue;
        }
        $kept[] = $item;
    }
    merlin_delete_audio($id);
    merlin_write_json('recordings.json', $kept);
    merlin_json_response(['ok' => true, 'recordings' => merlin_public_recordings($kept)]);
}

if (isset($input['record']) && is_array($input['record'])) {
    $entry = merlin_normalise_entry($input['record']);
    if ($entry === null) {
        merlin_json_response(['ok' => false, 'error' => 'A valid phone number or target is required.'], 400);
    }
    $audio = $input['record']['audioBase64'] ?? '';
    if (is_string($audio) && $audio !== '') {
        $decoded = base64_decode($audio, true);
        if ($decoded === false || !merlin_store_audio($entry['id'], $decoded)) {
            merlin_json_response(['ok' => false, 'error' => 'Recording audio could not be stored.'], 400);
        }
        $entry['size'] = strlen($decoded);
    }

    $existing = merlin_read_json('recordings.json', []);
    if (!is_array($existing)) {
        $existing = [];
    }
    array_unshift($existing, $entry);
    $trimmed = array_slice($existing, 0, 100);
    $keep = [];
    foreach ($trimmed as $item) {
        if (is_array($item)) {
            $keep[merlin_recording_id(merlin_string($item, 'id', 80))] = true;
        }
    }
    foreach ($existing as $item) {
        if (!is_array($item)) {
            continue;
        }
        $oldId = merlin_recording_id(merlin_string($item, 'id', 80));
        if ($oldId !== '' && !isset($keep[$oldId])) {
            merlin_delete_audio($oldId);
        }
    }
    merlin_write_json('recordings.json', $trimmed);
    $public = merlin_public_recordings($trimmed);
    merlin_json_response(['ok' => true, 'entry' => $public[0] ?? $entry, 'recordings' => $public]);
}

$items = $input['recordings'] ?? null;
if (!is_array($items)) {
    merlin_json_response(['ok' => false, 'error' => 'Recordings array required.'], 400);
}

$validated = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $entry = merlin_normalise_entry($item);
    if ($entry !== null) {
        $validated[] = $entry;
    }
}
$trimmed = array_slice($validated, 0, 100);
merlin_write_json('recordings.json', $trimmed);
merlin_json_response(['ok' => true, 'recordings' => merlin_public_recordings($trimmed)]);
