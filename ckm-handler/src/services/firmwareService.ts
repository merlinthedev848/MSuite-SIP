import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { FIRMWARE_DIR } from '../config';
import systemDb, { logActivity } from '../database/systemDb';
import { broadcastDeviceLog } from './telemetryStream';
import { FirmwareBinaryRow } from '../types/models';
import { HANDSET_CATALOG, ROUTER_CATALOG, DeviceModelMeta } from '../templates/catalog';

export interface FirmwareRecord {
  id?: number;
  category: 'handset' | 'router';
  brand: string;
  model: string;
  version: string;
  filename: string;
  filepath: string;
  file_size: number;
  sha256?: string;
  download_url?: string;
  status: 'AVAILABLE' | 'DOWNLOADING' | 'NOT_DOWNLOADED' | 'FAILED' | 'CUSTOM_UPLOAD';
  error_message?: string;
  downloaded_at?: string;
  updated_at?: string;
}

// --------------------------------------------------------------------------
// Database Prepared Statements
// --------------------------------------------------------------------------
const getFirmwareStmt = systemDb.prepare(`
  SELECT * FROM firmware_binaries 
  WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)
`);

const getFirmwareByFilenameStmt = systemDb.prepare(`
  SELECT * FROM firmware_binaries 
  WHERE LOWER(brand) = LOWER(?) AND LOWER(filename) = LOWER(?)
`);

const upsertFirmwareStmt = systemDb.prepare(`
  INSERT INTO firmware_binaries (
    category, brand, model, version, filename, filepath, file_size, sha256, 
    download_url, status, error_message, downloaded_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(brand, model, filename) DO UPDATE SET
    version = excluded.version,
    filepath = excluded.filepath,
    file_size = excluded.file_size,
    sha256 = excluded.sha256,
    download_url = excluded.download_url,
    status = excluded.status,
    error_message = excluded.error_message,
    downloaded_at = COALESCE(excluded.downloaded_at, firmware_binaries.downloaded_at),
    updated_at = CURRENT_TIMESTAMP
`);

const deleteFirmwareStmt = systemDb.prepare(`
  DELETE FROM firmware_binaries 
  WHERE LOWER(brand) = LOWER(?) AND LOWER(model) = LOWER(?)
`);

const getAllFirmwaresStmt = systemDb.prepare(`
  SELECT * FROM firmware_binaries ORDER BY brand, model
`);

// --------------------------------------------------------------------------
// Directory & Path Helpers
// --------------------------------------------------------------------------
export function sanitizeFolder(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getModelFirmwareDir(brand: string, model: string): string {
  const brandDir = sanitizeFolder(brand.toLowerCase());
  const modelDir = sanitizeFolder(model.toUpperCase());
  const fullDir = path.join(FIRMWARE_DIR, brandDir, modelDir);
  if (!fs.existsSync(fullDir)) {
    fs.mkdirSync(fullDir, { recursive: true });
  }
  return fullDir;
}

// --------------------------------------------------------------------------
// Find Model Metadata in Catalogs
// --------------------------------------------------------------------------
export function lookupModelMeta(brand: string, model: string): { category: 'handset' | 'router'; meta: DeviceModelMeta } | null {
  const b = brand.toLowerCase();
  const m = model.toLowerCase();

  for (const brandMeta of HANDSET_CATALOG) {
    if (brandMeta.id.toLowerCase() === b) {
      const match = brandMeta.models.find(mod => mod.id.toLowerCase() === m || mod.name.toLowerCase().includes(m));
      if (match) return { category: 'handset', meta: match };
    }
  }

  for (const brandMeta of ROUTER_CATALOG) {
    if (brandMeta.id.toLowerCase() === b) {
      const match = brandMeta.models.find(mod => mod.id.toLowerCase() === m || mod.name.toLowerCase().includes(m));
      if (match) return { category: 'router', meta: match };
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// Initialize & Reconcile Local Storage on Disk
// --------------------------------------------------------------------------
export function reconcileFirmwareStorage(): void {
  try {
    if (!fs.existsSync(FIRMWARE_DIR)) {
      fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
    }

    // Iterate through all catalog handset models
    for (const b of HANDSET_CATALOG) {
      for (const m of b.models) {
        if (!m.firmwareFilename) continue;
        const dir = getModelFirmwareDir(b.id, m.id);
        const filePath = path.join(dir, m.firmwareFilename);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          upsertFirmwareStmt.run(
            'handset',
            b.id.toLowerCase(),
            m.id.toUpperCase(),
            m.firmwareVersion,
            m.firmwareFilename,
            filePath,
            stats.size,
            null,
            m.directDownloadUrl || m.firmwareUrl,
            'AVAILABLE',
            null,
            stats.mtime.toISOString()
          );
        }
      }
    }

    // Iterate through all catalog router models
    for (const b of ROUTER_CATALOG) {
      for (const m of b.models) {
        if (!m.firmwareFilename) continue;
        const dir = getModelFirmwareDir(b.id, m.id);
        const filePath = path.join(dir, m.firmwareFilename);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          upsertFirmwareStmt.run(
            'router',
            b.id.toLowerCase(),
            m.id.toUpperCase(),
            m.firmwareVersion,
            m.firmwareFilename,
            filePath,
            stats.size,
            null,
            m.directDownloadUrl || m.firmwareUrl,
            'AVAILABLE',
            null,
            stats.mtime.toISOString()
          );
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[FirmwareService] Error reconciling firmware storage:', errMsg);
  }
}

// --------------------------------------------------------------------------
// Get Detailed Catalog with Local Cache Status
// --------------------------------------------------------------------------
export function getFirmwareCatalogStatus() {
  reconcileFirmwareStorage();
  const dbRows = getAllFirmwaresStmt.all() as FirmwareBinaryRow[];
  const cacheMap = new Map<string, FirmwareBinaryRow>();
  dbRows.forEach(r => {
    cacheMap.set(`${r.brand.toLowerCase()}_${r.model.toLowerCase()}`, r);
  });

  const mapModels = (brandId: string, category: 'handset' | 'router', models: DeviceModelMeta[]) => {
    return models.map(m => {
      const key = `${brandId.toLowerCase()}_${m.id.toLowerCase()}`;
      const cached = cacheMap.get(key);
      const expectedDir = getModelFirmwareDir(brandId, m.id);
      const expectedPath = path.join(expectedDir, m.firmwareFilename);
      const existsOnDisk = fs.existsSync(expectedPath);

      let size = 0;
      if (existsOnDisk) {
        try { size = fs.statSync(expectedPath).size; } catch {}
      } else if (cached && cached.file_size) {
        size = cached.file_size;
      }

      return {
        id: m.id,
        name: m.name,
        series: m.series,
        category,
        brand: brandId,
        firmwareVersion: m.firmwareVersion,
        firmwareFilename: m.firmwareFilename,
        firmwareUrl: m.firmwareUrl,
        directDownloadUrl: m.directDownloadUrl || null,
        notes: m.firmwareNotes || null,
        isCached: existsOnDisk,
        fileSizeBytes: size,
        fileSizeFormatted: size > 0 ? `${(size / 1024 / 1024).toFixed(2)} MB` : '0 MB',
        localPath: expectedPath,
        status: existsOnDisk ? 'AVAILABLE' : (cached?.status || 'NOT_DOWNLOADED'),
        downloadedAt: cached?.downloaded_at || null,
        errorMessage: cached?.error_message || null
      };
    });
  };

  const handsets = HANDSET_CATALOG.map(b => ({
    id: b.id,
    name: b.name,
    category: 'handset',
    models: mapModels(b.id, 'handset', b.models)
  }));

  const routers = ROUTER_CATALOG.map(b => ({
    id: b.id,
    name: b.name,
    category: 'router',
    models: mapModels(b.id, 'router', b.models)
  }));

  return { handsets, routers };
}

// --------------------------------------------------------------------------
// HTTP / HTTPS Stream Downloader with Redirect & Hash Computation
// --------------------------------------------------------------------------
function fetchBinaryStream(
  targetUrl: string, 
  destPath: string, 
  redirectCount = 0
): Promise<{ size: number; sha256: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      return reject(new Error('Too many HTTP redirects following vendor download URL.'));
    }

    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CKM-Handler-FirmwareDownloader/1.0',
        'Accept': '*/*'
      },
      timeout: 120000 // 2 minute timeout for large binary packages
    }, (res) => {
      // Follow Redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        res.resume();
        return resolve(fetchBinaryStream(nextUrl, destPath, redirectCount + 1));
      }

      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        res.resume();
        return reject(new Error(`Server returned HTTP status ${res.statusCode}: ${res.statusMessage}`));
      }

      const contentType = (res.headers['content-type'] || '').toLowerCase();
      // Guard against HTML landing pages (e.g. login/portal walls)
      if (contentType.includes('text/html')) {
        res.resume();
        return reject(new Error('Vendor URL returned an HTML web portal page rather than a direct binary firmware file. Please provide a direct download URL or upload the firmware file.'));
      }

      const partPath = `${destPath}.part`;
      const fileStream = fs.createWriteStream(partPath);
      const hash = crypto.createHash('sha256');
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        hash.update(chunk);
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          try {
            // Atomic rename
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
            fs.renameSync(partPath, destPath);
            const sha256 = hash.digest('hex');
            resolve({ size: totalBytes, sha256, contentType });
          } catch (err) {
            reject(err);
          }
        });
      });

      fileStream.on('error', (err) => {
        try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch {}
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timed out downloading firmware.'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

// --------------------------------------------------------------------------
// Auto-Download Firmware for a Single Model
// --------------------------------------------------------------------------
export async function downloadFirmwareForModel(
  brand: string, 
  model: string, 
  customUrl?: string
): Promise<{ ok: boolean; size: number; sha256: string; filename: string; path: string }> {
  const modelInfo = lookupModelMeta(brand, model);
  if (!modelInfo) {
    throw new Error(`Device model [${brand} / ${model}] was not found in the supported equipment catalog.`);
  }

  const { category, meta } = modelInfo;
  const downloadUrl = (customUrl && customUrl.trim()) ? customUrl.trim() : meta.directDownloadUrl;

  if (!downloadUrl) {
    throw new Error(`Vendor URL for ${meta.name} is an interactive support portal (${meta.firmwareUrl}). Please upload the binary file (.rom/.bin) directly or supply a direct download URL.`);
  }

  if (!downloadUrl.startsWith('http')) {
    throw new Error(`No valid HTTP/HTTPS download URL configured for model ${meta.name}.`);
  }

  const dir = getModelFirmwareDir(brand, model);
  const destPath = path.join(dir, meta.firmwareFilename);

  // Update status to DOWNLOADING
  upsertFirmwareStmt.run(
    category,
    brand.toLowerCase(),
    model.toUpperCase(),
    meta.firmwareVersion,
    meta.firmwareFilename,
    destPath,
    0,
    null,
    downloadUrl,
    'DOWNLOADING',
    null,
    null
  );

  broadcastDeviceLog('FIRMWARE', 'INFO', `Auto-downloading stable firmware for ${meta.name} (${meta.firmwareFilename}) from vendor source...`, {
    deviceIdentifier: `${brand.toUpperCase()}-${model.toUpperCase()}`,
    metadata: { downloadUrl, version: meta.firmwareVersion }
  });

  try {
    const result = await fetchBinaryStream(downloadUrl, destPath);

    upsertFirmwareStmt.run(
      category,
      brand.toLowerCase(),
      model.toUpperCase(),
      meta.firmwareVersion,
      meta.firmwareFilename,
      destPath,
      result.size,
      result.sha256,
      downloadUrl,
      'AVAILABLE',
      null,
      new Date().toISOString()
    );

    logActivity('FIRMWARE_DOWNLOADED', `Downloaded firmware [${meta.firmwareFilename}] (${(result.size / 1024 / 1024).toFixed(2)} MB) for ${meta.name}`);
    broadcastDeviceLog('FIRMWARE', 'SUCCESS', `Firmware downloaded & cached internally: ${meta.firmwareFilename} (${(result.size / 1024 / 1024).toFixed(2)} MB, SHA256: ${result.sha256.substring(0, 10)}...)`, {
      deviceIdentifier: `${brand.toUpperCase()}-${model.toUpperCase()}`,
      metadata: { filename: meta.firmwareFilename, size: result.size, sha256: result.sha256, localPath: destPath }
    });

    return {
      ok: true,
      size: result.size,
      sha256: result.sha256,
      filename: meta.firmwareFilename,
      path: destPath
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to download firmware package.';
    upsertFirmwareStmt.run(
      category,
      brand.toLowerCase(),
      model.toUpperCase(),
      meta.firmwareVersion,
      meta.firmwareFilename,
      destPath,
      0,
      null,
      downloadUrl,
      'FAILED',
      errorMsg,
      null
    );

    broadcastDeviceLog('FIRMWARE', 'ERROR', `Firmware download failed for ${meta.name}: ${errorMsg}`, {
      deviceIdentifier: `${brand.toUpperCase()}-${model.toUpperCase()}`,
      metadata: { error: errorMsg, downloadUrl }
    });

    throw new Error(errorMsg);
  }
}

// --------------------------------------------------------------------------
// Save Uploaded Firmware File
// --------------------------------------------------------------------------
export function saveUploadedFirmware(
  brand: string, 
  model: string, 
  originalFilename: string, 
  buffer: Buffer
): { ok: boolean; filename: string; size: number; sha256: string; path: string } {
  const modelInfo = lookupModelMeta(brand, model);
  const category = modelInfo ? modelInfo.category : 'handset';
  const targetFilename = modelInfo?.meta.firmwareFilename || originalFilename;

  const dir = getModelFirmwareDir(brand, model);
  const destPath = path.join(dir, targetFilename);

  fs.writeFileSync(destPath, buffer);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const size = buffer.length;

  upsertFirmwareStmt.run(
    category,
    brand.toLowerCase(),
    model.toUpperCase(),
    modelInfo?.meta.firmwareVersion || 'Custom',
    targetFilename,
    destPath,
    size,
    hash,
    'CUSTOM_UPLOAD',
    'AVAILABLE',
    null,
    new Date().toISOString()
  );

  logActivity('FIRMWARE_UPLOADED', `Uploaded custom firmware binary [${targetFilename}] (${(size / 1024 / 1024).toFixed(2)} MB) for ${brand.toUpperCase()} ${model.toUpperCase()}`);
  broadcastDeviceLog('FIRMWARE', 'SUCCESS', `Uploaded custom firmware stored in internal model directory: ${targetFilename} (${(size / 1024 / 1024).toFixed(2)} MB)`, {
    deviceIdentifier: `${brand.toUpperCase()}-${model.toUpperCase()}`,
    metadata: { filename: targetFilename, size, sha256: hash, localPath: destPath }
  });

  return { ok: true, filename: targetFilename, size, sha256: hash, path: destPath };
}

// --------------------------------------------------------------------------
// Delete Local Firmware File
// --------------------------------------------------------------------------
export function deleteFirmwareFile(brand: string, model: string): boolean {
  const modelInfo = lookupModelMeta(brand, model);
  const filename = modelInfo?.meta.firmwareFilename;
  const dir = getModelFirmwareDir(brand, model);

  if (filename) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // Also remove any remaining files in that model directory
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {}

  deleteFirmwareStmt.run(brand.toLowerCase(), model.toUpperCase());
  logActivity('FIRMWARE_DELETED', `Purged local firmware for ${brand.toUpperCase()} ${model.toUpperCase()}`);
  broadcastDeviceLog('FIRMWARE', 'INFO', `Local firmware deleted for ${brand.toUpperCase()} ${model.toUpperCase()}`, {
    deviceIdentifier: `${brand.toUpperCase()}-${model.toUpperCase()}`
  });

  return true;
}

// --------------------------------------------------------------------------
// Find Physical Firmware File on Disk for HTTP Device Boot Requests
// --------------------------------------------------------------------------
export function findFirmwareFile(brand: string, filename: string, model?: string): string | null {
  const cleanBrand = sanitizeFolder(brand.toLowerCase());
  const cleanFilename = path.basename(filename);

  // 1. Check direct model directory if model is specified
  if (model) {
    const cleanModel = sanitizeFolder(model.toUpperCase());
    const candidate = path.join(FIRMWARE_DIR, cleanBrand, cleanModel, cleanFilename);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 2. Search all model subdirectories under brand
  const brandDir = path.join(FIRMWARE_DIR, cleanBrand);
  if (fs.existsSync(brandDir)) {
    const entries = fs.readdirSync(brandDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const candidate = path.join(brandDir, ent.name, cleanFilename);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    // Also check brand root
    const rootCandidate = path.join(brandDir, cleanFilename);
    if (fs.existsSync(rootCandidate)) return rootCandidate;
  }

  return null;
}

// --------------------------------------------------------------------------
// Batch Auto-Download All Stable Firmwares with Direct Links
// --------------------------------------------------------------------------
let isSyncingBatch = false;

export async function syncAllStableFirmwares(): Promise<{ queued: number; message: string }> {
  if (isSyncingBatch) {
    return { queued: 0, message: 'Batch firmware auto-download is already in progress.' };
  }

  const targets: Array<{ brand: string; model: string; directUrl: string }> = [];

  for (const b of HANDSET_CATALOG) {
    for (const m of b.models) {
      if (m.directDownloadUrl) {
        targets.push({ brand: b.id, model: m.id, directUrl: m.directDownloadUrl });
      }
    }
  }

  for (const b of ROUTER_CATALOG) {
    for (const m of b.models) {
      if (m.directDownloadUrl) {
        targets.push({ brand: b.id, model: m.id, directUrl: m.directDownloadUrl });
      }
    }
  }

  // Start background sequential download
  (async () => {
    isSyncingBatch = true;
    broadcastDeviceLog('FIRMWARE', 'INFO', `Starting automated batch download of ${targets.length} vendor stable firmware packages...`);

    let successCount = 0;
    let failCount = 0;

    for (const t of targets) {
      try {
        await downloadFirmwareForModel(t.brand, t.model, t.directUrl);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    isSyncingBatch = false;
    broadcastDeviceLog('FIRMWARE', 'SUCCESS', `Batch firmware synchronization complete: ${successCount} downloaded, ${failCount} failed.`);
  })().catch(() => {
    isSyncingBatch = false;
  });

  return { queued: targets.length, message: `Queued ${targets.length} stable firmware packages for background auto-download.` };
}
