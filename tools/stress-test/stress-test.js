#!/usr/bin/env node
/**
 * CKM Handler & MerlinSIP Multi-Vector Stress & Load Test Harness
 * 
 * Usage:
 *   node stress-test.js --target http://<SERVER_IP_OR_DOMAIN> [options]
 * 
 * Options:
 *   --target <url>       Target server URL (e.g. http://192.168.1.100 or https://handler.domain.com)
 *   --token <token>      App secret token (default matches server default)
 *   --concurrency <num>  Concurrent workers/sockets (default: 50)
 *   --requests <num>     Total requests per HTTP benchmark (default: 500)
 *   --duration <sec>     Socket.IO load test duration in seconds (default: 15)
 *   --skip-sockets       Skip real-time WebSocket stress test
 *   --skip-files         Skip file upload stress test
 */

import { io } from 'socket.io-client';
import { performance } from 'perf_hooks';
import crypto from 'crypto';

// Parse command-line args
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}
const hasFlag = (name) => args.includes(`--${name}`);

const TARGET_URL = (getArg('target', 'http://127.0.0.1:3000')).replace(/\/+$/, '');
const APP_TOKEN = getArg('token', 'UClDFZpFu1gj7I8oGmKVsOvzGTqSFwq3jpcgLoC2ApmkyZTjpq1ftIZmJ5EMoshE');
const CONCURRENCY = parseInt(getArg('concurrency', '50'), 10);
const TOTAL_REQUESTS = parseInt(getArg('requests', '500'), 10);
const SOCKET_DURATION_SEC = parseInt(getArg('duration', '15'), 10);
const SKIP_SOCKETS = hasFlag('skip-sockets');
const SKIP_FILES = hasFlag('skip-files');

console.log('==============================================================================');
console.log('⚡ CKM Handler Multi-Vector Stress Testing Harness');
console.log(`   Target Server:   ${TARGET_URL}`);
console.log(`   Concurrency:     ${CONCURRENCY} workers`);
console.log(`   HTTP Requests:   ${TOTAL_REQUESTS} reqs / test`);
console.log(`   Socket Duration: ${SOCKET_DURATION_SEC}s`);
console.log('==============================================================================\n');

// Latency calculation helper
function calculateStats(latencies, totalDurationMs) {
  if (latencies.length === 0) return { count: 0, rps: 0, min: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const mean = sum / latencies.length;
  const p = (pct) => latencies[Math.min(latencies.length - 1, Math.floor((pct / 100) * latencies.length))];
  const rps = (latencies.length / (totalDurationMs / 1000)).toFixed(1);

  return {
    count: latencies.length,
    rps,
    min: latencies[0].toFixed(2),
    mean: mean.toFixed(2),
    p50: p(50).toFixed(2),
    p90: p(90).toFixed(2),
    p95: p(95).toFixed(2),
    p99: p(99).toFixed(2),
    max: latencies[latencies.length - 1].toFixed(2)
  };
}

function printStatsTable(title, stats, errors = 0, statusCounts = {}) {
  console.log(`--- [${title}] ---`);
  console.log(`  Completed:    ${stats.count} requests (${errors} errors)`);
  console.log(`  Throughput:   ${stats.rps} req/sec`);
  console.log(`  Latencies:    min: ${stats.min}ms | p50: ${stats.p50}ms | p90: ${stats.p90}ms | p95: ${stats.p95}ms | p99: ${stats.p99}ms | max: ${stats.max}ms`);
  if (Object.keys(statusCounts).length > 0) {
    const statusStr = Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  Status Codes: ${statusStr}`);
  }
  console.log('');
}

// Concurrent worker queue
async function runConcurrentHttpTest(url, method = 'GET', headers = {}, body = null, total = TOTAL_REQUESTS, concurrency = CONCURRENCY) {
  const latencies = [];
  const statusCounts = {};
  let errors = 0;
  let remaining = total;

  const startTotal = performance.now();

  async function worker() {
    while (true) {
      if (remaining <= 0) break;
      remaining--;

      const start = performance.now();
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? (typeof body === 'function' ? body() : body) : undefined
        });
        const duration = performance.now() - start;
        latencies.push(duration);
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
        if (!res.ok && res.status !== 429) {
          errors++;
        }
        await res.text(); // drain body
      } catch (err) {
        errors++;
        statusCounts['ERR'] = (statusCounts['ERR'] || 0) + 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  const totalDuration = performance.now() - startTotal;

  return { stats: calculateStats(latencies, totalDuration), errors, statusCounts };
}

// ----------------------------------------------------------------------------
// Test 1: Health & Probe Endpoint
// ----------------------------------------------------------------------------
async function testHealthProbe() {
  console.log('▶ [1/5] Testing /api/health Latency & Throughput...');
  const res = await runConcurrentHttpTest(`${TARGET_URL}/api/health`, 'GET');
  printStatsTable('/api/health Benchmark', res.stats, res.errors, res.statusCounts);
}

// ----------------------------------------------------------------------------
// Test 2: Softphone Config Sync & Yealink Phonebook XML Generation
// ----------------------------------------------------------------------------
async function testConfigSyncAndPhonebook() {
  console.log('▶ [2/5] Testing Softphone Config Sync (/api/v1/config/sync)...');
  const resSync = await runConcurrentHttpTest(`${TARGET_URL}/api/v1/config/sync`, 'GET', {
    'Authorization': `Bearer ${APP_TOKEN}`
  });
  printStatsTable('Softphone Config Sync', resSync.stats, resSync.errors, resSync.statusCounts);

  console.log('▶ Testing Yealink Phonebook XML Generation (/phonebook/yealink.xml)...');
  const resPhone = await runConcurrentHttpTest(`${TARGET_URL}/phonebook/yealink.xml`, 'GET');
  printStatsTable('Yealink XML Directory', resPhone.stats, resPhone.errors, resPhone.statusCounts);
}

// ----------------------------------------------------------------------------
// Test 3: Softphone PIN Brute-force & Rate-Limiting Guard
// ----------------------------------------------------------------------------
async function testPinRateLimiting() {
  console.log('▶ [3/5] Stressing Softphone PIN Provisioning (/sip/provision/00000000)...');
  console.log('       (Testing brute-force rate limiter to verify 429 Too Many Requests response under attack)');
  const res = await runConcurrentHttpTest(`${TARGET_URL}/sip/provision/00000000`, 'POST', {
    'Content-Type': 'application/json'
  }, JSON.stringify({ deviceId: 'stress-test-worker' }), 200, CONCURRENCY);
  printStatsTable('PIN Provision Rate Limiter', res.stats, res.errors, res.statusCounts);
}

// ----------------------------------------------------------------------------
// Test 4: File Vault Multipart Upload & Download Stress
// ----------------------------------------------------------------------------
async function testFileVault() {
  if (SKIP_FILES) {
    console.log('▶ [4/5] Skipping File Vault stress test (--skip-files passed)');
    return;
  }

  console.log('▶ [4/5] Testing Encrypted File Vault Uploads & Downloads (/files/upload)...');
  const testPayloadSize = 256 * 1024; // 256 KB audio voice note
  const dummyBuffer = crypto.randomBytes(testPayloadSize);
  const uploadedFiles = [];
  const latencies = [];
  const statusCounts = {};
  let errors = 0;

  const startTotal = performance.now();
  const fileUploadTotal = Math.min(TOTAL_REQUESTS, 60);

  let remaining = fileUploadTotal;
  async function uploadWorker() {
    while (true) {
      if (remaining <= 0) break;
      remaining--;

      const boundary = '----StressBoundary' + crypto.randomBytes(8).toString('hex');
      const filename = `stress_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.wav`;
      
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([Buffer.from(header, 'utf8'), dummyBuffer, Buffer.from(footer, 'utf8')]);

      const start = performance.now();
      try {
        const res = await fetch(`${TARGET_URL}/files/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Authorization': `Bearer ${APP_TOKEN}`
          },
          body
        });
        const duration = performance.now() - start;
        latencies.push(duration);
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;

        if (res.ok) {
          const json = await res.json();
          if (json.fileId || json.url) {
            uploadedFiles.push(json.fileId || json.url);
          }
        } else {
          errors++;
        }
      } catch (err) {
        errors++;
        statusCounts['ERR'] = (statusCounts['ERR'] || 0) + 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, 15) }, () => uploadWorker());
  await Promise.all(workers);
  const totalDuration = performance.now() - startTotal;
  printStatsTable(`File Vault Upload (${testPayloadSize / 1024} KB payload)`, calculateStats(latencies, totalDuration), errors, statusCounts);

  // If we uploaded files, test reading them back concurrently
  if (uploadedFiles.length > 0) {
    console.log(`▶ Testing download retrieval for ${uploadedFiles.length} stored files...`);
    const dlLatencies = [];
    const dlStatus = {};
    let dlErrors = 0;
    const dlStart = performance.now();

    for (const fileRef of uploadedFiles) {
      const url = fileRef.startsWith('http') ? fileRef : `${TARGET_URL}${fileRef.startsWith('/') ? '' : '/'}${fileRef}`;
      const s = performance.now();
      try {
        const res = await fetch(url);
        dlLatencies.push(performance.now() - s);
        dlStatus[res.status] = (dlStatus[res.status] || 0) + 1;
        if (!res.ok) dlErrors++;
        await res.arrayBuffer();
      } catch (e) {
        dlErrors++;
        dlStatus['ERR'] = (dlStatus['ERR'] || 0) + 1;
      }
    }
    const dlTotal = performance.now() - dlStart;
    printStatsTable('File Vault Retrieval', calculateStats(dlLatencies, dlTotal), dlErrors, dlStatus);
  }
}

// ----------------------------------------------------------------------------
// Test 5: Real-Time Socket.IO Multi-Client Concurrency & Broadcast Flood
// ----------------------------------------------------------------------------
async function testSocketIoLoad() {
  if (SKIP_SOCKETS) {
    console.log('▶ [5/5] Skipping Socket.IO stress test (--skip-sockets passed)');
    return;
  }

  console.log(`▶ [5/5] Real-Time Socket.IO Stress Test (${CONCURRENCY} concurrent client sockets)...`);
  console.log(`       Connecting ${CONCURRENCY} virtual softphones, joining rooms, flooding messages for ${SOCKET_DURATION_SEC}s...`);

  const sockets = [];
  const connectionTimes = [];
  let connectErrors = 0;
  let messagesSent = 0;
  let messagesReceived = 0;
  const messageRoundtrips = [];

  const connectStart = performance.now();

  const connectPromises = Array.from({ length: CONCURRENCY }, (_, i) => {
    return new Promise((resolve) => {
      const socketStart = performance.now();
      const socket = io(TARGET_URL, {
        auth: { token: APP_TOKEN },
        extraHeaders: { 'Authorization': `Bearer ${APP_TOKEN}` },
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10000
      });

      socket.on('connect', () => {
        connectionTimes.push(performance.now() - socketStart);
        socket.emit('join_conversation', `room_${i % 10}`);
        sockets.push(socket);
        resolve(true);
      });

      socket.on('receive_message', (data) => {
        messagesReceived++;
        if (data && data._clientSendTs) {
          const rtt = performance.now() - data._clientSendTs;
          messageRoundtrips.push(rtt);
        }
      });

      socket.on('connect_error', () => {
        connectErrors++;
        resolve(false);
      });
    });
  });

  await Promise.all(connectPromises);
  const totalConnectTime = performance.now() - connectStart;

  console.log(`  Connected:     ${sockets.length}/${CONCURRENCY} sockets in ${(totalConnectTime / 1000).toFixed(2)}s (${connectErrors} connection errors)`);
  if (connectionTimes.length > 0) {
    const connStats = calculateStats(connectionTimes, totalConnectTime);
    console.log(`  Connect Time:  min: ${connStats.min}ms | p50: ${connStats.p50}ms | p95: ${connStats.p95}ms | max: ${connStats.max}ms`);
  }

  if (sockets.length > 0) {
    console.log(`  Flooding messages across rooms for ${SOCKET_DURATION_SEC} seconds...`);
    const burstStart = performance.now();
    const interval = setInterval(() => {
      // Pick random active sockets and blast messages
      for (let j = 0; j < Math.min(sockets.length, 25); j++) {
        const randIndex = Math.floor(Math.random() * sockets.length);
        const sock = sockets[randIndex];
        if (sock.connected) {
          messagesSent++;
          sock.emit('send_message', {
            conversationId: `room_${randIndex % 10}`,
            senderId: `stress_user_${randIndex}`,
            messageType: 'text',
            content: `Stress payload test ${messagesSent}`,
            _clientSendTs: performance.now()
          });
        }
      }
    }, 100);

    await new Promise((resolve) => setTimeout(resolve, SOCKET_DURATION_SEC * 1000));
    clearInterval(interval);
    const burstDurationMs = performance.now() - burstStart;

    // Allow 1.5s for pending ACKs
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log(`--- [Socket.IO Messaging Metrics] ---`);
    console.log(`  Sent:         ${messagesSent} messages (${(messagesSent / (burstDurationMs / 1000)).toFixed(1)} msg/sec)`);
    console.log(`  Delivered:    ${messagesReceived} broadcast deliveries`);
    if (messageRoundtrips.length > 0) {
      const rttStats = calculateStats(messageRoundtrips, burstDurationMs);
      console.log(`  Latency RTT:  min: ${rttStats.min}ms | p50: ${rttStats.p50}ms | p90: ${rttStats.p90}ms | p95: ${rttStats.p95}ms | max: ${rttStats.max}ms`);
    }
  }

  // Gracefully close all sockets
  for (const s of sockets) {
    s.disconnect();
  }
}

// ----------------------------------------------------------------------------
// Main Execution
// ----------------------------------------------------------------------------
async function runAll() {
  const overallStart = performance.now();
  try {
    await testHealthProbe();
    await testConfigSyncAndPhonebook();
    await testPinRateLimiting();
    await testFileVault();
    await testSocketIoLoad();

    const totalSeconds = ((performance.now() - overallStart) / 1000).toFixed(1);
    console.log('==============================================================================');
    console.log(`✅ Stress Test Suite Completed in ${totalSeconds}s!`);
    console.log('==============================================================================\n');
  } catch (err) {
    console.error('[-] Stress test failed with uncaught error:', err);
    process.exit(1);
  }
}

runAll();
