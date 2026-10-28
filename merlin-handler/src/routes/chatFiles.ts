import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { UPLOADS_DIR } from '../config';
import vaultDb from '../database/vaultDb';

const router = Router();

// Configure Multer for encrypted / obfuscated vault storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Cryptographically secure UUID-style filename: e.g. "a1b2c3d4-e5f6-7890-..."
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// 1. File / Voice Note / Recording Upload
router.post('/files/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file was uploaded.' });
  }

  const fileId = path.parse(req.file.filename).name;
  const originalName = req.file.originalname || 'attachment.dat';
  const mimeType = req.file.mimetype || 'application/octet-stream';
  const fileSize = req.file.size;
  const storedPath = req.file.path;
  const uploadedBy = String(req.body.senderId || req.body.extension || 'anonymous');
  const conversationId = String(req.body.conversationId || '');

  // Log in GDPR Communications Vault
  vaultDb.prepare(`
    INSERT INTO media_vault_files (file_id, original_name, mime_type, file_size, stored_path, uploaded_by, conversation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(fileId, originalName, mimeType, fileSize, storedPath, uploadedBy, conversationId);

  return res.json({
    success: true,
    fileId,
    fileName: originalName,
    fileSize,
    mimeType,
    url: `/files/${fileId}`
  });
});

// 2. File Download / Media Streaming
router.get('/files/:fileId', (req: Request, res: Response) => {
  const fileId = req.params.fileId;

  const record = vaultDb.prepare(`
    SELECT file_id, original_name, mime_type, file_size, stored_path
    FROM media_vault_files
    WHERE file_id = ?
  `).get(fileId) as any;

  if (!record || !fs.existsSync(record.stored_path)) {
    return res.status(404).json({ success: false, error: 'File not found or has expired.' });
  }

  res.setHeader('Content-Type', record.mime_type);
  res.setHeader('Content-Length', record.file_size);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.original_name)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const stream = fs.createReadStream(record.stored_path);
  return stream.pipe(res);
});

export default router;
