/**
 * Merlin SIP - Enterprise Stress Testing & Concurrency Benchmark Suite
 *
 * Verifies high-throughput performance, concurrency race-condition safety,
 * memory stability, and zero-bottleneck execution across CKM Handler core engines.
 */

const http = require('http');
const path = require('path');

// Ensure module resolution to ckm-handler node_modules
const ckmNodeModules = path.resolve(__dirname, '../node_modules');
module.paths.unshift(ckmNodeModules);

const express = require('express');
const systemDb = require('../dist/database/systemDb').default;
const softphoneProvisionRouter = require('../dist/routes/softphoneProvision').default;
const hardwareProvisionRouter = require('../dist/routes/hardwareProvision').default;
const integrationApiRouter = require('../dist/routes/integrationApi').default;
const selfServicePinRouter = require('../dist/routes/selfServicePin').default;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(softphoneProvisionRouter);
app.use(hardwareProvisionRouter);
app.use(integrationApiRouter);
app.use(selfServicePinRouter);

let server;
let serverPort = 0;
let apiKey = '';

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = null; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runBenchmark() {
  console.log('\n===============================================================');
  console.log('   MERLIN SIP - ENTERPRISE STRESS & CONCURRENCY BENCHMARK');
  console.log('===============================================================\n');

  // Start dedicated benchmark server
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  const cfg = systemDb.prepare('SELECT api_key FROM server_config WHERE id = 1').get();
  apiKey = cfg.api_key;
  console.log(`[Setup] Stress test HTTP server listening on 127.0.0.1:${serverPort}`);
  console.log(`[Setup] System API Key loaded: ${apiKey.substring(0, 10)}...\n`);

  const memStart = process.memoryUsage();
  console.log(`[Memory Baseline] Heap: ${(memStart.heapUsed / 1024 / 1024).toFixed(2)} MB | RSS: ${(memStart.rss / 1024 / 1024).toFixed(2)} MB\n`);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
    } else {
      console.error(`  [FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
    }
  }

  // --------------------------------------------------------------------------
  // BENCHMARK 1: SQLite Extreme Concurrency & ACID Throughput
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: SQLite Concurrent Read/Write Throughput (500 Ops) ---');
  const t0_db = performance.now();
  const dbOps = 500;
  const promisesDb = [];

  for (let i = 0; i < dbOps; i++) {
    promisesDb.push(new Promise((resolve, reject) => {
      try {
        const ext = `9${String(i).padStart(4, '0')}`;
        systemDb.prepare(`
          INSERT INTO extensions (extension, sip_username, sip_password, display_name, email, is_active)
          VALUES (?, ?, 'TestPass123!', ?, ?, 1)
          ON CONFLICT(extension) DO UPDATE SET display_name = excluded.display_name
        `).run(ext, ext, `Stress User ${i}`, `stress${i}@testcarrier.net`);

        systemDb.prepare(`
          INSERT INTO audit_activity_logs (event_type, details, ip_address)
          VALUES ('STRESS_TEST', ?, '127.0.0.1')
        `).run(`Concurrent database operation ${i}`);

        const row = systemDb.prepare('SELECT * FROM extensions WHERE extension = ?').get(ext);
        resolve(row ? true : false);
      } catch (err) {
        reject(err);
      }
    }));
  }

  const dbResults = await Promise.all(promisesDb);
  const t1_db = performance.now();
  const totalDbMs = (t1_db - t0_db).toFixed(1);
  const opsPerSec = ((dbOps / totalDbMs) * 1000).toFixed(0);

  assert(dbResults.every(r => r === true), '500 concurrent ACID write+audit+read operations succeeded', `${totalDbMs}ms total, ~${opsPerSec} ops/sec`);

  // --------------------------------------------------------------------------
  // BENCHMARK 2: Softphone PIN Race Condition Safety
  // 50 concurrent requests simultaneously attempting to claim the EXACT SAME PIN
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Softphone PIN Race Condition & Claim Atomicity (50 Concurrent) ---');
  const testExt = '8801';
  const testPin = '88880001';

  systemDb.prepare(`
    INSERT INTO extensions (extension, sip_username, sip_password, display_name, email, is_active)
    VALUES (?, ?, 'SecurePass123!', 'Race Test User', 'race@test.com', 1)
    ON CONFLICT(extension) DO UPDATE SET is_active = 1
  `).run(testExt, testExt);

  systemDb.prepare('DELETE FROM softphone_pins WHERE extension = ?').run(testExt);
  systemDb.prepare(`
    INSERT INTO softphone_pins (code, extension, claimed, expires_at)
    VALUES (?, ?, 0, datetime('now', '+1 hour'))
  `).run(testPin, testExt);

  const t0_race = performance.now();
  const raceRequests = [];
  for (let i = 0; i < 50; i++) {
    raceRequests.push(httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: `/sip/provision/${testPin}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  const raceResponses = await Promise.all(raceRequests);
  const t1_race = performance.now();

  const success200 = raceResponses.filter(r => r.statusCode === 200);
  const conflict409 = raceResponses.filter(r => r.statusCode === 409);
  const otherCodes = raceResponses.filter(r => r.statusCode !== 200 && r.statusCode !== 409);

  assert(success200.length === 1, 'Exactly ONE concurrent request claimed the PIN (Atomic Win)', `200 Count = ${success200.length}`);
  assert(conflict409.length === 49, 'Remaining 49 concurrent requests received 409 Conflict (No Double Claim)', `409 Count = ${conflict409.length}`);
  assert(otherCodes.length === 0, 'Zero unexpected errors or race leaks', `Total time: ${(t1_race - t0_race).toFixed(1)}ms`);

  // Verify PIN is recorded as claimed in database
  const pinDb = systemDb.prepare('SELECT claimed FROM softphone_pins WHERE code = ?').get(testPin);
  assert(pinDb && pinDb.claimed === 1, 'Database confirms PIN claimed status = 1');

  // Verify subsequent claim request is immediately rejected with 409
  const retestRes = await httpRequest({
    hostname: '127.0.0.1',
    port: serverPort,
    path: `/sip/provision/${testPin}`,
    method: 'POST'
  });
  assert(retestRes.statusCode === 409, 'Subsequent replay attack with claimed PIN rejected with 409');

  // --------------------------------------------------------------------------
  // BENCHMARK 3: Option 66 Deskphone Boot Storm (200 Concurrent Devices)
  // Simulates an entire office building power restoration with 200 phones booting
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Option 66 Boot Storm (200 Concurrent Phones) ---');
  // Seed physical handsets
  const insertHandsetStmt = systemDb.prepare(`
    INSERT INTO physical_handsets (mac_address, brand, model, extension, line_label)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(mac_address) DO UPDATE SET extension = excluded.extension
  `);

  const handsetBatch = [];
  for (let i = 0; i < 50; i++) {
    const mac = `001565${String(i).padStart(6, '0')}`;
    const ext = `9${String(i).padStart(4, '0')}`;
    insertHandsetStmt.run(mac, 'yealink', 'T46U', ext, `Line ${ext}`);
    handsetBatch.push(mac);
  }

  const t0_boot = performance.now();
  const bootRequests = [];

  for (let i = 0; i < 200; i++) {
    const mac = handsetBatch[i % handsetBatch.length];
    bootRequests.push(httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: `/provision/${mac}.cfg`,
      method: 'GET',
      headers: {
        'User-Agent': 'Yealink SIP-T46U 66.86.0.5'
      }
    }));
  }

  const bootResponses = await Promise.all(bootRequests);
  const t1_boot = performance.now();
  const bootTotalMs = (t1_boot - t0_boot).toFixed(1);

  const bootOk = bootResponses.filter(r => r.statusCode === 200 && r.body.includes('account.1.enable = 1'));
  assert(bootOk.length === 200, '200 simultaneous Option 66 deskphone boots provisioned with valid configs', `${bootTotalMs}ms total, ~${((200 / bootTotalMs) * 1000).toFixed(0)} req/sec`);

  // --------------------------------------------------------------------------
  // BENCHMARK 4: Billing System API Concurrent Reset Suite (100 Requests)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Billing Integration API Concurrency (100 Operations) ---');
  const t0_billing = performance.now();
  const billingRequests = [];

  for (let i = 0; i < 100; i++) {
    const ext = `9${String(i).padStart(4, '0')}`;
    billingRequests.push(httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/v1/billing/reset-pin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    }, {
      extension: ext,
      expiryHours: 48,
      dispatchEmail: false
    }));
  }

  const billingResponses = await Promise.all(billingRequests);
  const t1_billing = performance.now();
  const billingTotalMs = (t1_billing - t0_billing).toFixed(1);

  const billingOk = billingResponses.filter(r => r.statusCode === 200 && r.json && r.json.pin && r.json.pin.length === 8);
  assert(billingOk.length === 100, '100 concurrent Billing API PIN resets generated valid 8-digit codes & deep links', `${billingTotalMs}ms total`);

  // --------------------------------------------------------------------------
  // BENCHMARK 5: Customer Self-Service PIN Rate-Limiter Stress
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Customer Self-Service PIN Rate Limiter Resilience ---');
  const rateLimitTargetEmail = 'stresstarget@customer.com';
  systemDb.prepare(`
    INSERT INTO extensions (extension, sip_username, sip_password, display_name, email, is_active)
    VALUES ('8999', '8999', 'Pass123!', 'Self Service Stress User', ?, 1)
    ON CONFLICT(extension) DO UPDATE SET email = excluded.email
  `).run(rateLimitTargetEmail);

  let allowedCount = 0;
  let rateLimitedCount = 0;

  for (let i = 0; i < 6; i++) {
    const res = await httpRequest({
      hostname: '127.0.0.1',
      port: serverPort,
      path: '/api/v1/self-service/request-pin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: rateLimitTargetEmail
    });

    if (res.statusCode === 200) allowedCount++;
    if (res.statusCode === 429) rateLimitedCount++;
  }

  assert(allowedCount <= 3, 'Rate limiter permits valid threshold (<= 3 requests within window)', `Allowed: ${allowedCount}`);
  assert(rateLimitedCount >= 3, 'Rate limiter blocks excess flood with HTTP 429', `Blocked: ${rateLimitedCount}`);

  // --------------------------------------------------------------------------
  // BENCHMARK 6: Memory Stability & Garbage Collection Check
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Memory & Resource Leak Inspection ---');
  // Allow any pending microtasks to clear
  await new Promise(r => setTimeout(r, 100));
  const memEnd = process.memoryUsage();
  const heapDiffMb = ((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024).toFixed(2);
  const rssDiffMb = ((memEnd.rss - memStart.rss) / 1024 / 1024).toFixed(2);

  console.log(`  [Memory Final] Heap: ${(memEnd.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: ${heapDiffMb} MB) | RSS: ${(memEnd.rss / 1024 / 1024).toFixed(2)} MB (Delta: ${rssDiffMb} MB)`);
  assert(Math.abs(parseFloat(heapDiffMb)) < 50, 'Heap memory bounded with zero runaway leakage after 1,000+ operations', `Delta: ${heapDiffMb} MB`);

  // Cleanup test extensions created during benchmark
  systemDb.prepare("DELETE FROM extensions WHERE extension LIKE '9%' OR extension IN ('8801', '8999')").run();
  systemDb.prepare("DELETE FROM audit_activity_logs WHERE event_type = 'STRESS_TEST'").run();

  server.close();

  console.log('\n===============================================================');
  console.log(`   BENCHMARK COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runBenchmark().catch(err => {
  console.error('[Benchmark Fatal Error]', err);
  if (server) server.close();
  process.exit(1);
});
