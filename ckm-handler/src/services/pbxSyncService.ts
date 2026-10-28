import net from 'net';
import systemDb from '../database/systemDb';

export interface AmiConfig {
  host: string;
  port: number;
  username: string;
  secret: string;
}

export interface SyncedExtension {
  extension: string;
  displayName: string;
  username: string;
  password?: string;
}

/**
 * Connects to Asterisk Manager Interface (AMI) on port 5038 and fetches all configured SIP extensions
 */
export async function syncExtensionsFromAsterisk(ami: AmiConfig): Promise<{ success: boolean; count: number; message: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = '';
    let loggedIn = false;
    let timeoutTimer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      socket.removeAllListeners();
      socket.destroy();
    };

    timeoutTimer = setTimeout(() => {
      cleanup();
      resolve({ success: false, count: 0, message: 'AMI connection to Asterisk PBX timed out after 8 seconds.' });
    }, 8000);

    socket.connect(ami.port || 5038, ami.host, () => {
      console.log(`[PBX Sync] Connected to Asterisk AMI at ${ami.host}:${ami.port}`);
    });

    socket.on('data', (data) => {
      buffer += data.toString('utf-8');

      // 1. Initial Greeting: Send Login
      if (buffer.includes('Asterisk Call Manager') && !loggedIn) {
        loggedIn = true;
        socket.write(`Action: Login\r\nUsername: ${ami.username}\r\nSecret: ${ami.secret}\r\nEvents: off\r\n\r\n`);
        buffer = '';
        return;
      }

      // 2. Login Response
      if (buffer.includes('Response: Success') && buffer.includes('Message: Authentication accepted')) {
        buffer = '';
        // Request PJSIP endpoints or SIP peers
        socket.write(`Action: PJSIPShowEndpoints\r\n\r\n`);
        socket.write(`Action: SIPpeers\r\n\r\n`);
        return;
      }

      // 3. Process Endpoint / Peer Events
      if (buffer.includes('Event: EndpointDetailComplete') || buffer.includes('Event: PeerlistComplete') || buffer.includes('Response: Error')) {
        const found = parseAmiOutput(buffer);
        cleanup();

        if (found.length === 0) {
          resolve({ success: true, count: 0, message: 'Connected to PBX, but no SIP extensions were returned.' });
          return;
        }

        // Insert or update into system.db
        let added = 0;
        const stmt = systemDb.prepare(`
          INSERT INTO extensions (extension, sip_username, sip_password, display_name)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(extension) DO UPDATE SET
            display_name = excluded.display_name
        `);

        for (const ext of found) {
          stmt.run(ext.extension, ext.username, ext.password || 'ExtPassword123!', ext.displayName);
          added++;
        }

        resolve({
          success: true,
          count: added,
          message: `Successfully synced ${added} extension(s) from Asterisk/FreePBX.`
        });
      }
    });

    socket.on('error', (err) => {
      cleanup();
      resolve({ success: false, count: 0, message: `AMI Connection error: ${err.message}` });
    });
  });
}

function parseAmiOutput(raw: string): SyncedExtension[] {
  const extensions: SyncedExtension[] = [];
  const lines = raw.split(/\r?\n/);
  let currentExt = '';
  let currentName = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ObjectName:') || trimmed.startsWith('Peer:')) {
      const parts = trimmed.split(':');
      currentExt = parts[1]?.trim().replace(/^SIP\//, '') || '';
    } else if (trimmed.startsWith('Callerid:') || trimmed.startsWith('Description:')) {
      const parts = trimmed.split(':');
      currentName = parts.slice(1).join(':').trim().replace(/["<>]/g, '') || '';
    }

    if (currentExt && /^\d{2,6}$/.test(currentExt)) {
      if (!extensions.some(e => e.extension === currentExt)) {
        extensions.push({
          extension: currentExt,
          username: currentExt,
          displayName: currentName || `Extension ${currentExt}`
        });
      }
      currentExt = '';
      currentName = '';
    }
  }

  return extensions;
}
