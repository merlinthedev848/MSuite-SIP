<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    merlin_json_response(['ok' => true, 'history' => merlin_read_json('history.json', [])]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    merlin_write_json('history.json', []);
    merlin_json_response(['ok' => true, 'message' => 'Call history cleared.', 'history' => []]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();
$validStatuses = ['Ended', 'Connected', 'Busy', 'Declined', 'Declined (DND)', 'Missed', 'Cancelled', 'Failed', 'No Answer'];

// Check if appending a single call record
if (isset($input['record']) && is_array($input['record'])) {
    $item = $input['record'];
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 80));
    if ($number === '') {
        merlin_json_response(['ok' => false, 'error' => 'A valid phone number or SIP destination is required.'], 400);
    }

    $status = merlin_string($item, 'status', 40) ?: 'Ended';
    if (!in_array($status, $validStatuses, true)) {
        $status = 'Ended';
    }

    $entry = [
        'id' => merlin_string($item, 'id', 80) ?: ('h-' . bin2hex(random_bytes(6))),
        'number' => $number,
        'name' => merlin_string($item, 'name', 120) ?: $number,
        'direction' => in_array(($item['direction'] ?? ''), ['Inbound', 'Outbound'], true) ? $item['direction'] : 'Outbound',
        'status' => $status,
        'duration' => max(0, (int) ($item['duration'] ?? 0)),
        'startedAt' => merlin_string($item, 'startedAt', 40) ?: gmdate(DATE_ATOM),
        'notes' => merlin_string($item, 'notes', 300),
    ];

    $existing = merlin_read_json('history.json', []);
    if (!is_array($existing)) {
        $existing = [];
    }
    array_unshift($existing, $entry);
    $trimmed = array_slice($existing, 0, 300);
    merlin_write_json('history.json', $trimmed);
    merlin_json_response(['ok' => true, 'entry' => $entry, 'history' => $trimmed]);
}

$items = $input['history'] ?? [];
if (!is_array($items)) {
    merlin_json_response(['ok' => false, 'error' => 'History array or record required.'], 400);
}

$history = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }

    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 80));
    if ($number === '') {
        continue; // Skip invalid empty destination entries
    }

    $status = merlin_string($item, 'status', 40) ?: 'Ended';
    if (!in_array($status, $validStatuses, true)) {
        $status = 'Ended';
    }

    $history[] = [
        'id' => merlin_string($item, 'id', 80) ?: ('h-' . bin2hex(random_bytes(6))),
        'number' => $number,
        'name' => merlin_string($item, 'name', 120) ?: $number,
        'direction' => in_array(($item['direction'] ?? ''), ['Inbound', 'Outbound'], true) ? $item['direction'] : 'Outbound',
        'status' => $status,
        'duration' => max(0, (int) ($item['duration'] ?? 0)),
        'startedAt' => merlin_string($item, 'startedAt', 40) ?: gmdate(DATE_ATOM),
        'notes' => merlin_string($item, 'notes', 300),
    ];
}

$saved = array_slice(array_values($history), 0, 300);
merlin_write_json('history.json', $saved);
merlin_json_response(['ok' => true, 'history' => $saved]);
