<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$defaultContacts = [
    [
        'id' => 'c-100',
        'name' => 'Reception Desk',
        'number' => '100',
        'company' => 'Head Office',
        'notes' => 'Main front desk and operator line',
        'favorite' => true,
        'presence' => 'online',
    ],
    [
        'id' => 'c-101',
        'name' => 'Sales Department',
        'number' => '101',
        'company' => 'Commercial',
        'notes' => 'Direct sales & inquiry line',
        'favorite' => true,
        'presence' => 'busy',
    ],
    [
        'id' => 'c-150',
        'name' => 'IT Support Hotdesk',
        'number' => '150',
        'company' => 'Technical Operations',
        'notes' => 'Internal infrastructure and PBX support',
        'favorite' => true,
        'presence' => 'online',
    ],
    [
        'id' => 'c-201',
        'name' => 'Conference Room A',
        'number' => '201',
        'company' => 'Meeting Facilities',
        'notes' => 'Polycom soundstation in Boardroom A',
        'favorite' => false,
        'presence' => 'offline',
    ],
    [
        'id' => 'c-9',
        'name' => 'Outbound Trunk',
        'number' => '9',
        'company' => 'SIP Gateway',
        'notes' => 'Primary PSTN route prefix',
        'favorite' => false,
        'presence' => 'online',
    ],
];

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
$items = $input['contacts'] ?? [];
if (!is_array($items)) {
    merlin_json_response(['ok' => false, 'error' => 'Contacts array required.'], 400);
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
        'number' => $number,
        'company' => merlin_string($item, 'company', 120),
        'notes' => merlin_string($item, 'notes', 600),
        'favorite' => !empty($item['favorite']),
        'presence' => $presence,
    ];
}

merlin_write_json('contacts.json', array_values($contacts));
merlin_json_response(['ok' => true, 'contacts' => $contacts]);


