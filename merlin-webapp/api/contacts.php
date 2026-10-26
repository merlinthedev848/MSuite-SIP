<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$defaultContacts = [];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $contacts = merlin_read_json('contacts.json', null);
    if ($contacts === null) {
        $contacts = $defaultContacts;
        merlin_write_json('contacts.json', $contacts);
    }
    merlin_json_response(['ok' => true, 'contacts' => $contacts]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    merlin_json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$input = merlin_request_json();
$items = $input['contacts'] ?? null;

// Allow single contact payload
if ($items === null && isset($input['contact']) && is_array($input['contact'])) {
    $item = $input['contact'];
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 120));
    $name = merlin_string($item, 'name', 120);
    if ($name === '' && $number === '') {
        merlin_json_response(['ok' => false, 'error' => 'Contact name or number required.'], 400);
    }

    $existing = merlin_read_json('contacts.json', $defaultContacts);
    if (!is_array($existing)) {
        $existing = [];
    }

    $contactId = merlin_string($item, 'id', 80) ?: ('c-' . bin2hex(random_bytes(6)));
    $presence = in_array(($item['presence'] ?? ''), ['online', 'busy', 'offline', 'away', 'dnd', 'ringing'], true)
        ? $item['presence']
        : 'offline';

    $newEntry = [
        'id' => $contactId,
        'name' => $name ?: $number,
        'number' => $number ?: $name,
        'company' => merlin_string($item, 'company', 120),
        'notes' => merlin_string($item, 'notes', 600),
        'favorite' => !empty($item['favorite']),
        'presence' => $presence,
    ];

    // Update if exists or prepend
    $found = false;
    foreach ($existing as $idx => $c) {
        if (($c['id'] ?? '') === $contactId) {
            $existing[$idx] = $newEntry;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $existing[] = $newEntry;
    }

    merlin_write_json('contacts.json', array_values($existing));
    merlin_json_response(['ok' => true, 'contact' => $newEntry, 'contacts' => $existing]);
}

if (!is_array($items)) {
    merlin_json_response(['ok' => false, 'error' => 'Contacts array or contact object required.'], 400);
}

$contacts = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }

    $name = merlin_string($item, 'name', 120);
    $number = preg_replace('/[^a-zA-Z0-9+*#@.:_-]/', '', merlin_string($item, 'number', 120));
    if ($name === '' && $number === '') {
        continue;
    }

    $rawPresence = $item['presence'] ?? '';
    if ($rawPresence === 'available') {
        $presence = 'online';
    } elseif (in_array($rawPresence, ['online', 'busy', 'offline', 'away', 'dnd', 'ringing'], true)) {
        $presence = $rawPresence;
    } else {
        $presence = 'offline';
    }

    $contacts[] = [
        'id' => merlin_string($item, 'id', 80) ?: ('c-' . bin2hex(random_bytes(6))),
        'name' => $name ?: $number,
        'number' => $number ?: $name,
        'company' => merlin_string($item, 'company', 120),
        'notes' => merlin_string($item, 'notes', 600),
        'favorite' => !empty($item['favorite']),
        'presence' => $presence,
    ];
}

merlin_write_json('contacts.json', array_values($contacts));
merlin_json_response(['ok' => true, 'contacts' => $contacts]);
