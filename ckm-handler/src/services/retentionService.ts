import fs from 'fs';
import vaultDb from '../database/vaultDb';
import { broadcastDeviceLog } from './telemetryStream';
import { GdprRetentionPolicyRow } from '../types/models';

let retentionTimer: NodeJS.Timeout | null = null;

export interface RetentionPruningResult {
  success: boolean;
  prunedMessages: number;
  prunedFiles: number;
  message: string;
}

export function runRetentionPruning(force: boolean = false): RetentionPruningResult {
  try {
    const policy = vaultDb.prepare('SELECT * FROM gdpr_retention_policy WHERE id = 1').get() as GdprRetentionPolicyRow | undefined;
    if (!policy) {
      return { success: false, prunedMessages: 0, prunedFiles: 0, message: 'No GDPR retention policy found.' };
    }

    if (!force && policy.auto_prune_enabled !== 1) {
      return { success: true, prunedMessages: 0, prunedFiles: 0, message: 'Automated pruning is disabled by policy.' };
    }

    const chatDays = policy.chat_retention_days || 90;
    const mediaDays = policy.media_retention_days || 90;

    console.log(`[GDPR Pruner] Executing data retention cleanup (Chat: ${chatDays}d, Media: ${mediaDays}d, Force: ${force})...`);

    // 1. Prune expired chat messages
    const chatCutoff = new Date(Date.now() - chatDays * 24 * 3600 * 1000).toISOString();
    const chatResult = vaultDb.prepare(`
      DELETE FROM messages WHERE timestamp < ?
    `).run(chatCutoff);

    // 2. Prune expired media files and disk assets
    const mediaCutoff = new Date(Date.now() - mediaDays * 24 * 3600 * 1000).toISOString();
    const expiredFiles = vaultDb.prepare(`
      SELECT file_id, stored_path FROM media_vault_files WHERE created_at < ?
    `).all(mediaCutoff) as { file_id: string; stored_path: string }[];

    let unlinkedFiles = 0;
    for (const f of expiredFiles) {
      try {
        if (fs.existsSync(f.stored_path)) {
          fs.unlinkSync(f.stored_path);
          unlinkedFiles++;
        }
      } catch (err: unknown) {
        console.warn(`[GDPR Pruner] Warning: Could not unlink media file ${f.stored_path}:`, err);
      }
    }

    vaultDb.prepare('DELETE FROM media_vault_files WHERE created_at < ?').run(mediaCutoff);

    // Update last pruned timestamp
    vaultDb.prepare('UPDATE gdpr_retention_policy SET last_pruned_at = CURRENT_TIMESTAMP WHERE id = 1').run();

    broadcastDeviceLog('SECURITY', 'INFO', `GDPR retention daemon: purged ${chatResult.changes} expired message(s) and ${unlinkedFiles} media file(s).`, {
      metadata: { prunedMessages: chatResult.changes, prunedFiles: unlinkedFiles }
    });

    console.log(`[GDPR Pruner] Pruning complete: Removed ${chatResult.changes} expired messages and ${unlinkedFiles} media files.`);
    return {
      success: true,
      prunedMessages: chatResult.changes,
      prunedFiles: unlinkedFiles,
      message: `Successfully purged ${chatResult.changes} expired message(s) and ${unlinkedFiles} media file(s).`
    };
  } catch (err: unknown) {
    console.error('[GDPR Pruner] Error during retention pruning:', err);
    return {
      success: false,
      prunedMessages: 0,
      prunedFiles: 0,
      message: err instanceof Error ? err.message : 'Unknown pruning error occurred.'
    };
  }
}

export function startRetentionScheduler(): void {
  // Run on startup
  runRetentionPruning();

  // Run once every 24 hours (86,400,000 ms)
  retentionTimer = setInterval(() => {
    runRetentionPruning();
  }, 24 * 3600 * 1000);
  retentionTimer.unref();
}

export function stopRetentionScheduler(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}
