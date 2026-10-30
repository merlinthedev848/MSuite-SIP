import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { PORT, SERVER_DOMAIN } from './config';
import { initializeSocketService } from './services/socketService';
import { startRetentionScheduler } from './services/retentionService';
import { licenseGateMiddleware, startLicenseGuardDaemon } from './services/licenseGuard';

import softphoneProvisionRouter from './routes/softphoneProvision';
import hardwareProvisionRouter from './routes/hardwareProvision';
import directoryRouter from './routes/directory';
import chatFilesRouter from './routes/chatFiles';
import gdprRouter from './routes/gdpr';
import adminRouter from './routes/admin';
import integrationApiRouter from './routes/integrationApi';
import firmwareRouter from './routes/firmwareRoute';
import cwmpRouter from './routes/cwmpRoute';
import selfServicePinRouter from './routes/selfServicePin';
import { reconcileFirmwareStorage } from './services/firmwareService';
import { startPbxSyncDaemon } from './services/pbxSyncService';

const app = express();
const server = http.createServer(app);

// 1. Core Middleware
app.use(cors({ origin: '*' }));
app.use(express.text({ type: ['text/*', 'application/xml', 'text/xml', 'application/soap+xml'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Health & Status Probe
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ckm-handler',
    domain: SERVER_DOMAIN,
    timestamp: new Date().toISOString()
  });
});

// 3. License Guard & IP Protection Middleware
app.use(licenseGateMiddleware);

// 4. Mount Route Engines
app.use(cwmpRouter);
app.use(softphoneProvisionRouter);
app.use(hardwareProvisionRouter);
app.use(firmwareRouter);
app.use(directoryRouter);
app.use(chatFilesRouter);
app.use(adminRouter);
app.use(gdprRouter);
app.use(integrationApiRouter);
app.use(selfServicePinRouter);

// 5. Static Web Admin Portal
const adminStaticPath = path.resolve(__dirname, '../public/admin');
app.use('/admin', express.static(adminStaticPath));

// 5b. Public Customer Self-Service PIN Portal
const pinStaticPath = path.resolve(__dirname, '../public/pin');
app.use('/pin', express.static(pinStaticPath));
app.get('/pin', (req, res) => {
  res.sendFile(path.resolve(pinStaticPath, 'index.html'));
});

// Seamless root redirect to Admin Dashboard
app.get('/', (req, res) => {
  res.redirect(302, '/admin');
});

// Favicon handlers to prevent 404 log noise
app.get('/favicon.ico', (req, res) => {
  const icoPath = path.resolve(adminStaticPath, 'favicon.ico');
  if (fs.existsSync(icoPath)) return res.sendFile(icoPath);
  res.status(204).end();
});

app.get('/favicon.png', (req, res) => {
  const pngPath = path.resolve(adminStaticPath, 'favicon.png');
  if (fs.existsSync(pngPath)) return res.sendFile(pngPath);
  res.status(204).end();
});

// API 404 handler for unknown endpoints
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `API endpoint ${req.method} ${req.originalUrl} not found` });
});

// Global Error Boundary & Exception Handler
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[CKM Handler Internal Error]', err);
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal Server Error'
  });
});

// 6. Initialize Real-Time Socket.IO Server
initializeSocketService(server);

// 7. Start Automated GDPR Retention Scheduler & 24h License Guard Daemon
startRetentionScheduler();
startLicenseGuardDaemon();
reconcileFirmwareStorage();
startPbxSyncDaemon();

// 8. Start Server Listener
server.listen(PORT, () => {
  console.log(`==============================================================================`);
  console.log(`[CKM Handler] Unified Communications & Provisioning Gateway`);
  console.log(`[Status] Active on port ${PORT} | Domain: https://${SERVER_DOMAIN}`);
  console.log(`[Admin Portal] Access at: http://localhost:${PORT}/admin`);
  console.log(`[Engines Loaded]`);
  console.log(`  - Real-Time Chat & Media Vault (Socket.io + Files)`);
  console.log(`  - Softphone Auto-Provisioning & 10-Min Dynamic Sync`);
  console.log(`  - Physical Handset Provisioning (Yealink / Fanvil / Grandstream)`);
  console.log(`  - Internal Model Firmware Repository (Auto-Download & Option 66 Serving)`);
  console.log(`  - Corporate Directory & Phonebook (XML + JSON)`);
  console.log(`  - GDPR Isolated Storage & Automated Retention Pruner`);
  console.log(`==============================================================================`);
});
