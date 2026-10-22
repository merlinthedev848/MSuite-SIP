<?php
declare(strict_types=1);

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    fwrite(STDERR, "Access Denied: CLI SAPI required.\n");
    exit(1);
}

require dirname(__DIR__) . '/api/bootstrap.php';

$lockFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'merlin_cron_prune.lock';
$lockHandle = fopen($lockFile, 'c');

if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    fwrite(STDOUT, "[" . date('c') . "] Another prune worker is active. Exiting.\n");
    if ($lockHandle) {
        fclose($lockHandle);
    }
    exit(0);
}

try {
    fwrite(STDOUT, "[" . date('c') . "] Starting Merlin maintenance & retention prune...\n");

    // 1. Retention prune for call history (90 days)
    $retentionLimit = time() - (90 * 86400);
    $history = merlin_read_json('history.json', []);

    if (is_array($history) && !empty($history)) {
        $initialCount = count($history);
        $retained = [];

        foreach ($history as $entry) {
            $started = strtotime($entry['startedAt'] ?? '');
            if ($started !== false && $started < $retentionLimit) {
                continue; // Pruned
            }
            $retained[] = $entry;
        }

        $pruned = $initialCount - count($retained);
        if ($pruned > 0) {
            merlin_write_json('history.json', array_slice($retained, 0, 300));
            fwrite(STDOUT, "[" . date('c') . "] Pruned {$pruned} expired call history records.\n");
        } else {
            fwrite(STDOUT, "[" . date('c') . "] No call records exceeded 90-day retention limit.\n");
        }
    }

    // 2. Clean up orphaned temporary files in data directory older than 1 hour
    $dataDir = merlin_data_dir();
    if (is_dir($dataDir)) {
        $tmpFiles = glob($dataDir . DIRECTORY_SEPARATOR . '*.tmp');
        if ($tmpFiles !== false) {
            $cleanedTmp = 0;
            $oneHourAgo = time() - 3600;
            foreach ($tmpFiles as $file) {
                if (filemtime($file) < $oneHourAgo) {
                    if (@unlink($file)) {
                        $cleanedTmp++;
                    }
                }
            }
            if ($cleanedTmp > 0) {
                fwrite(STDOUT, "[" . date('c') . "] Cleaned {$cleanedTmp} orphaned temporary file(s).\n");
            }
        }
    }

    fwrite(STDOUT, "[" . date('c') . "] Maintenance task completed successfully.\n");
} catch (\Throwable $e) {
    fwrite(STDERR, "[" . date('c') . "] FATAL EXCEPTION: " . $e->getMessage() . "\n");
    error_log("[Merlin Cron Error] " . $e->getMessage() . "\n" . $e->getTraceAsString());
    exit(1);
} finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}

exit(0);
