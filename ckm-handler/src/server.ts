import http from 'http';
import path from 'path';
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

const app = express();
const server = http.createServer(app);

// 1. Core Middleware
app.use(cors({ origin: '*' }));
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
app.use(softphoneProvisionRouter);
app.use(hardwareProvisionRouter);
app.use(directoryRouter);
app.use(chatFilesRouter);
app.use('/api/admin', adminRouter);
app.use(adminRouter);
app.use(gdprRouter);
app.use(integrationApiRouter);

// 5. Static Web Admin Portal
const adminStaticPath = path.resolve(__dirname, '../public/admin');
app.use('/admin', express.static(adminStaticPath));

// 6. Initialize Real-Time Socket.IO Server
initializeSocketService(server);

// 7. Start Automated GDPR Retention Scheduler & 24h License Guard Daemon
startRetentionScheduler();
startLicenseGuardDaemon();

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
  console.log(`  - Corporate Directory & Phonebook (XML + JSON)`);
  console.log(`  - GDPR Isolated Storage & Automated Retention Pruner`);
  console.log(`==============================================================================`);
});
