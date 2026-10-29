import fs from 'fs';
import vaultDb from '../database/vaultDb';
import { broadcastDeviceLog } from './telemetryStream';

export function runRetentionPruning() {
  try {
    const policy = vaultDb.prepare('SELECT * FROM gdpr_retention_policy WHERE id = 1').get() as any;
    if (!policy || policy.auto_prune_enabled !== 1) {
      return;
    }

    const chatDays = policy.chat_retention_days || 90;
    const mediaDays = policy.media_retention_days || 90;

    console.log(`[GDPR Pruner] Executing automated data retention cleanup (Chat: ${chatDays}d, Media: ${mediaDays}d)...`);

    // 1. Prune expired chat messages
    const chatCutoff = new Date(Date.now() - chatDays * 24 * 3600 * 1000).toISOString();
    const chatResult = vaultDb.prepare(`
      DELETE FROM messages WHERE timestamp < ?
    `).run(chatCutoff);

    // 2. Prune expired media files and disk assets
    const mediaCutoff = new Date(Date.now() - mediaDays * 24 * 3600 * 1000).toISOString();
    const expiredFiles = vaultDb.prepare(`
      SELECT file_id, stored_path FROM media_vault_files WHERE created_at < ?
    `).all(mediaCutoff) as any[];

    let unlinkedFiles = 0;
    for (const f of expiredFiles) {
      try {
        if (fs.existsSync(f.stored_path)) {
          fs.unlinkSync(f.stored_path);
          unlinkedFiles++;
        }
      } catch {
        // ignore individual unlink error
      }
    }

    vaultDb.prepare('DELETE FROM media_vault_files WHERE created_at < ?').run(mediaCutoff);

    // Update last pruned timestamp
    vaultDb.prepare('UPDATE gdpr_retention_policy SET last_pruned_at = CURRENT_TIMESTAMP WHERE id = 1').run();

    broadcastDeviceLog('SECURITY', 'INFO', `Automated GDPR retention daemon: purged ${chatResult.changes} expired message(s) and ${unlinkedFiles} media file(s).`, {
      metadata: { prunedMessages: chatResult.changes, prunedFiles: unlinkedFiles }
    });

    console.log(`[GDPR Pruner] Pruning complete: Removed ${chatResult.changes} expired messages and ${unlinkedFiles} media files.`);
  } catch (err) {
    console.error('[GDPR Pruner] Error during retention pruning:', err);
  }
}

export function startRetentionScheduler() {
  // Run on startup
  runRetentionPruning();

  // Run once every 24 hours (86,400,000 ms)
  setInterval(() => {
    runRetentionPruning();
  }, 24 * 3600 * 1000);
}
