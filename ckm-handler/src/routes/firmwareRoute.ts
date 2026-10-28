import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { findFirmwareFile } from '../services/firmwareService';
import { broadcastDeviceLog } from '../services/telemetryStream';

const router = Router();

// GET /firmware/:brand/:model/:filename
router.get('/firmware/:brand/:model/:filename', (req: Request, res: Response) => {
  const { brand, model, filename } = req.params;
  const filePath = findFirmwareFile(brand, filename, model);

  if (!filePath || !fs.existsSync(filePath)) {
    broadcastDeviceLog('FIRMWARE', 'WARN', `Firmware file [${filename}] for ${brand.toUpperCase()} ${model.toUpperCase()} was requested by ${req.ip} but is not cached in internal directory.`, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string
    });
    return res.status(404).send(`# Error: Firmware binary [${filename}] is not downloaded or cached in internal directory.`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Device (${req.ip}) downloading firmware [${filename}] for ${brand.toUpperCase()} ${model.toUpperCase()} from internal storage`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  return res.sendFile(path.resolve(filePath), { acceptRanges: true });
});

// GET /firmware/:brand/:filename (Fallback for common vendor paths)
router.get('/firmware/:brand/:filename', (req: Request, res: Response) => {
  const { brand, filename } = req.params;
  const filePath = findFirmwareFile(brand, filename);

  if (!filePath || !fs.existsSync(filePath)) {
    broadcastDeviceLog('FIRMWARE', 'WARN', `Firmware file [${filename}] for ${brand.toUpperCase()} was requested by ${req.ip} but is not cached in internal directory.`, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string
    });
    return res.status(404).send(`# Error: Firmware binary [${filename}] is not downloaded or cached in internal directory.`);
  }

  broadcastDeviceLog('DESKPHONE', 'INFO', `Device (${req.ip}) downloading firmware [${filename}] for ${brand.toUpperCase()} from internal storage`, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string
  });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  return res.sendFile(path.resolve(filePath), { acceptRanges: true });
});

export default router;
