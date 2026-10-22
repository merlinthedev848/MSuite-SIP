<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    merlin_json_response([
        'ok' => true,
        'recordings' => merlin_read_json('recordings.json', [])
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    merlin_write_json('recordings.json', []);
    merlin_json_response(['ok' => true, 'message' => 'Recordings cleared.', 'recordings' => []]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();

if (isset($input['record']) && is_array($input['record'])) {
    $item = $input['record'];
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 80));
    if ($number === '') {
        merlin_json_response(['ok' => false, 'error' => 'A valid phone number or target is required.'], 400);
    }

    $entry = [
        'id' => merlin_string($item, 'id', 80) ?: ('rec-' . bin2hex(random_bytes(6))),
        'number' => $number,
        'name' => merlin_string($item, 'name', 120) ?: 'Unknown',
        'direction' => in_array(($item['direction'] ?? ''), ['Inbound', 'Outbound'], true) ? $item['direction'] : 'Outbound',
        'duration' => max(0, (int) ($item['duration'] ?? 0)),
        'timestamp' => merlin_string($item, 'timestamp', 40) ?: gmdate(DATE_ATOM),
        'format' => merlin_string($item, 'format', 20) ?: 'audio/webm',
        'size' => max(0, (int) ($item['size'] ?? 0)),
    ];

    $existing = merlin_read_json('recordings.json', []);
    if (!is_array($existing)) {
        $existing = [];
    }
    array_unshift($existing, $entry);
    $trimmed = array_slice($existing, 0, 100);
    merlin_write_json('recordings.json', $trimmed);
    merlin_json_response(['ok' => true, 'entry' => $entry, 'recordings' => $trimmed]);
}

$items = $input['recordings'] ?? [];
if (!is_array($items)) {
    merlin_json_response(['ok' => false, 'error' => 'Recordings array required.'], 400);
}

$validatedRecordings = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 80));
    if ($number === '') {
        continue;
    }
    $validatedRecordings[] = [
        'id' => merlin_string($item, 'id', 80) ?: ('rec-' . bin2hex(random_bytes(6))),
        'number' => $number,
        'name' => merlin_string($item, 'name', 120) ?: 'Unknown',
        'direction' => in_array(($item['direction'] ?? ''), ['Inbound', 'Outbound'], true) ? $item['direction'] : 'Outbound',
        'duration' => max(0, (int) ($item['duration'] ?? 0)),
        'timestamp' => merlin_string($item, 'timestamp', 40) ?: gmdate(DATE_ATOM),
        'format' => merlin_string($item, 'format', 20) ?: 'audio/webm',
        'size' => max(0, (int) ($item['size'] ?? 0)),
    ];
}

$trimmed = array_slice($validatedRecordings, 0, 100);
merlin_write_json('recordings.json', $trimmed);
merlin_json_response(['ok' => true, 'recordings' => $trimmed]);
