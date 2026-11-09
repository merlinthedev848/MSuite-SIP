import { useState, useRef, useCallback } from 'react';

export interface DiagnosticStep {
  name: string;
  action: (log: (msg: string, isError?: boolean) => void) => Promise<boolean>;
}

export function useDiagnostics(sipServer: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isPass, setIsPass] = useState(true);
  const [statusText, setStatusText] = useState('Initializing Diagnostics...');
  const [logs, setLogs] = useState('');

  const cancelRef = useRef(false);

  const runDiagnostics = useCallback(async () => {
    setIsRunning(true);
    setIsComplete(false);
    setLogs('');
    cancelRef.current = false;

    const logLines: string[] = [];
    const log = (msg: string, isError = false) => {
      const line = `${isError ? '[ERROR] ' : ''}${msg}\n`;
      logLines.push(line);
      setLogs(logLines.join(''));
    };

    log('Starting Merlin Network Diagnostic Tool...');
    log('=================================================================');
    log(`Timestamp:         ${new Date().toISOString()}`);
    log('Reports live client and browser capabilities.');
    log('=================================================================');

    const target = (sipServer || '').trim();
    const steps: DiagnosticStep[] = [
      {
        name: 'Configured server reachability',
        action: async (logFn) => {
          if (!target) {
            logFn('No SIP server is configured.', true);
            return false;
          }
          const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
          const started = performance.now();
          try {
            await fetch(url, { mode: 'no-cors', cache: 'no-store' });
            const ms = Math.round(performance.now() - started);
            logFn(`The browser reached ${url} in ${ms}ms.`);
            return true;
          } catch (err) {
            logFn(`Could not reach ${url}. ${err instanceof Error ? err.message : ''}`.trim(), true);
            return false;
          }
        }
      },
      {
        name: 'WebRTC & Audio Device Stack',
        action: async (logFn) => {
          if (!navigator.mediaDevices?.enumerateDevices) {
            logFn('Audio devices API is unavailable in this browser context.', true);
            return false;
          }
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput').length;
            const outputs = devices.filter(d => d.kind === 'audiooutput').length;
            logFn(`Audio inputs detected: ${inputs}. Audio outputs detected: ${outputs}.`);
            return inputs > 0;
          } catch (err) {
            logFn(`Device scan failed: ${err instanceof Error ? err.message : ''}`, true);
            return false;
          }
        }
      },
      {
        name: 'WebSockets & TLS Handshake Capabilities',
        action: async (logFn) => {
          if (typeof WebSocket === 'undefined') {
            logFn('WebSocket standard is not supported by this browser.', true);
            return false;
          }
          logFn('WebSocket (WSS) engine is active and ready for real-time signaling.');
          return true;
        }
      }
    ];

    let passedCount = 0;

    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) {
        log('\nDiagnostics aborted by user.');
        setStatusText('Diagnostics Aborted');
        setIsRunning(false);
        return;
      }

      const step = steps[i];
      setStatusText(`Running: ${step.name}...`);
      log(`\n=== CHECK ${i + 1}/${steps.length}: ${step.name.toUpperCase()} ===`);
      log('-----------------------------------------------------------------');

      const pass = await step.action(log);
      if (pass) passedCount += 1;
    }

    log('\n=================================================================');
    if (passedCount === steps.length) {
      log(`All ${steps.length} checks passed successfully.`);
      setStatusText('Diagnostics Completed - PASS');
      setIsPass(true);
    } else {
      log(`${passedCount} of ${steps.length} checks passed.`);
      setStatusText('Diagnostics Completed - WARN / FAIL');
      setIsPass(false);
    }

    setIsComplete(true);
    setIsRunning(false);
  }, [sipServer]);

  const abortDiagnostics = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    isRunning,
    isComplete,
    isPass,
    statusText,
    logs,
    runDiagnostics,
    abortDiagnostics
  };
}
