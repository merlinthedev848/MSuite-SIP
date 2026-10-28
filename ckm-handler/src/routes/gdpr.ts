import { Router, Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import vaultDb from '../database/vaultDb';
import { decryptVaultText } from '../database/cryptoVault';

const router = Router();

// 1. Right to Erasure / Right to be Forgotten (GDPR Article 17)
router.delete('/api/v1/gdpr/user/:extension', (req: Request, res: Response) => {
  const extension = String(req.params.extension).trim();
  const executedBy = String(req.headers['x-admin-user'] || 'system-admin');

  if (!extension) {
    return res.status(400).json({ ok: false, error: 'Extension parameter is required.' });
  }

  // A. Find and delete physical media files uploaded by user
  const userFiles = vaultDb.prepare(`
    SELECT file_id, stored_path FROM media_vault_files WHERE uploaded_by = ?
  `).all(extension) as any[];

  let filesDeleted = 0;
  for (const f of userFiles) {
    try {
      if (fs.existsSync(f.stored_path)) {
        fs.unlinkSync(f.stored_path);
        filesDeleted++;
      }
    } catch {
      // ignore unlink error
    }
  }

  vaultDb.prepare('DELETE FROM media_vault_files WHERE uploaded_by = ?').run(extension);

  // B. Delete chat messages
  const msgResult = vaultDb.prepare(`
    DELETE FROM messages WHERE sender_id = ? OR conversation_id = ?
  `).run(extension, extension);

  // C. Delete contact directory record
  const contactResult = vaultDb.prepare('DELETE FROM contacts WHERE extension = ?').run(extension);

  // D. Generate Cryptographic Audit Certificate Hash
  const rawCert = `ERASURE:${extension}:${Date.now()}:${msgResult.changes}:${filesDeleted}:${executedBy}`;
  const certHash = crypto.createHash('sha256').update(rawCert).digest('hex');

  vaultDb.prepare(`
    INSERT INTO gdpr_audit_logs (action_type, target_extension, details, certificate_hash, executed_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'RIGHT_TO_ERASURE',
    extension,
    `Purged ${msgResult.changes} messages and ${filesDeleted} media attachments.`,
    certHash,
    executedBy
  );

  return res.json({
    ok: true,
    action: 'USER_PURGED',
    extension,
    messagesRemoved: msgResult.changes,
    filesRemoved: filesDeleted,
    contactsRemoved: contactResult.changes,
    certificateHash: certHash,
    executedAt: new Date().toISOString()
  });
});

// 2. Data Portability Export (GDPR Article 20)
router.get('/api/v1/gdpr/user/:extension/export', (req: Request, res: Response) => {
  const extension = String(req.params.extension).trim();
  
  const rawMessages = vaultDb.prepare(`
    SELECT id, conversation_id, sender_id, message_type, content, file_name, file_size, timestamp
    FROM messages
    WHERE sender_id = ? OR conversation_id = ?
    ORDER BY id ASC
  `).all(extension, extension) as any[];

  const userMessages = rawMessages.map(m => ({
    ...m,
    content: decryptVaultText(m.content)
  }));

  const userContacts = vaultDb.prepare(`
    SELECT extension, full_name, email, mobile, department, created_at
    FROM contacts
    WHERE extension = ?
  `).all(extension);

  const userFiles = vaultDb.prepare(`
    SELECT file_id, original_name, mime_type, file_size, created_at
    FROM media_vault_files
    WHERE uploaded_by = ?
  `).all(extension);

  return res.json({
    ok: true,
    exportType: 'GDPR_ARTICLE_20_PORTABILITY',
    extension,
    generatedAt: new Date().toISOString(),
    data: {
      profile: userContacts[0] || { extension },
      messages: userMessages,
      uploadedMedia: userFiles
    }
  });
});

// 3. Get / Set Retention Policy
router.get(['/api/v1/gdpr/policy', '/api/admin/gdpr/policy'], (req: Request, res: Response) => {
  const policy = vaultDb.prepare('SELECT * FROM gdpr_retention_policy WHERE id = 1').get();
  return res.json({ ok: true, policy });
});

router.post(['/api/v1/gdpr/policy', '/api/admin/gdpr/policy'], (req: Request, res: Response) => {
  const { chatDays, mediaDays, autoPrune } = req.body;
  vaultDb.prepare(`
    UPDATE gdpr_retention_policy 
    SET chat_retention_days = ?, media_retention_days = ?, auto_prune_enabled = ?
    WHERE id = 1
  `).run(
    parseInt(chatDays || '90', 10),
    parseInt(mediaDays || '90', 10),
    autoPrune ? 1 : 0
  );

  return res.json({ ok: true, message: 'GDPR retention policy updated.' });
});

export default router;
