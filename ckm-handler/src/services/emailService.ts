import net from 'net';
import tls from 'tls';
import { exec } from 'child_process';

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean; // true for port 465 SSL, false for 587 STARTTLS / 25
  user?: string;
  pass?: string;
  from: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email via configured SMTP server or system sendmail fallback
 */
export async function sendEmail(config: SmtpConfig, options: EmailOptions): Promise<{ success: boolean; message: string }> {
  // If SMTP host is configured, send via direct SMTP socket
  if (config.host && config.host.trim()) {
    return sendViaSmtpSocket(config, options);
  }

  // Fallback: Check if local Unix sendmail exists
  return sendViaSendmail(config.from, options);
}

function sendViaSendmail(from: string, options: EmailOptions): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const rawMsg = [
      `From: ${from}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      options.html || options.text
    ].join('\r\n');

    const proc = exec('/usr/sbin/sendmail -t -i', (err) => {
      if (err) {
        resolve({
          success: false,
          message: `Local sendmail failed: ${err.message}. Please configure an SMTP server in Global Settings.`
        });
      } else {
        resolve({ success: true, message: 'Dispatched via system mailer.' });
      }
    });

    if (proc.stdin) {
      proc.stdin.write(rawMsg);
      proc.stdin.end();
    }
  });
}

function sendViaSmtpSocket(config: SmtpConfig, options: EmailOptions): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const port = config.port || 587;
    const isDirectSsl = port === 465 || Boolean(config.secure);
    const host = config.host.trim();

    let socket: net.Socket;
    let buffer = '';
    let step = 0;
    let completed = false;

    const cleanup = () => {
      completed = true;
      try { socket.end(); } catch {}
      try { socket.destroy(); } catch {}
    };

    const finish = (success: boolean, msg: string) => {
      if (completed) return;
      cleanup();
      resolve({ success, message: msg });
    };

    const onData = (data: Buffer) => {
      buffer += data.toString('utf-8');
      const lines = buffer.split('\r\n');
      const lastLine = lines[lines.length - 2] || lines[lines.length - 1] || '';
      
      // Wait for complete multi-line reply (e.g. "250-", ending in "250 ")
      if (/^\d{3} /.test(lastLine)) {
        const code = parseInt(lastLine.substring(0, 3), 10);
        handleStep(code, lastLine);
        buffer = '';
      }
    };

    const handleStep = (code: number, response: string) => {
      if (code >= 400 && step !== 99) {
        return finish(false, `SMTP Error (${code}): ${response}`);
      }

      switch (step) {
        case 0: // Connected, banner received (220)
          if (code === 220) {
            step = 1;
            socket.write(`EHLO ${host}\r\n`);
          }
          break;

        case 1: // EHLO response received
          if (port === 587 && !isDirectSsl) {
            step = 2;
            socket.write('STARTTLS\r\n');
          } else if (config.user && config.pass) {
            step = 4;
            socket.write('AUTH LOGIN\r\n');
          } else {
            step = 6;
            socket.write(`MAIL FROM:<${config.from}>\r\n`);
          }
          break;

        case 2: // STARTTLS response (220)
          if (code === 220) {
            step = 3;
            // Upgrade socket to TLS
            const tlsSocket = tls.connect({
              socket: socket,
              host: host,
              rejectUnauthorized: false
            }, () => {
              socket = tlsSocket;
              tlsSocket.on('data', onData);
              socket.write(`EHLO ${host}\r\n`);
            });
            tlsSocket.on('error', (err) => finish(false, `TLS Error: ${err.message}`));
          }
          break;

        case 3: // Post-TLS EHLO response
          if (config.user && config.pass) {
            step = 4;
            socket.write('AUTH LOGIN\r\n');
          } else {
            step = 6;
            socket.write(`MAIL FROM:<${config.from}>\r\n`);
          }
          break;

        case 4: // AUTH LOGIN prompt for username (334)
          step = 5;
          socket.write(`${Buffer.from(config.user || '').toString('base64')}\r\n`);
          break;

        case 5: // AUTH LOGIN prompt for password (334)
          step = 6;
          socket.write(`${Buffer.from(config.pass || '').toString('base64')}\r\n`);
          break;

        case 6: // Auth successful (235) or ready for MAIL FROM
          step = 7;
          socket.write(`MAIL FROM:<${config.from}>\r\n`);
          break;

        case 7: // MAIL FROM ok (250)
          step = 8;
          socket.write(`RCPT TO:<${options.to}>\r\n`);
          break;

        case 8: // RCPT TO ok (250)
          step = 9;
          socket.write('DATA\r\n');
          break;

        case 9: // Ready for data (354)
          step = 10;
          const msg = [
            `From: ${config.from}`,
            `To: ${options.to}`,
            `Subject: ${options.subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            options.html || options.text,
            '\r\n.\r\n'
          ].join('\r\n');
          socket.write(msg);
          break;

        case 10: // Data accepted (250)
          step = 99;
          socket.write('QUIT\r\n');
          finish(true, 'Email successfully delivered via SMTP.');
          break;
      }
    };

    try {
      if (isDirectSsl) {
        socket = tls.connect(port, host, { rejectUnauthorized: false }, () => {});
      } else {
        socket = net.createConnection(port, host, () => {});
      }

      socket.setTimeout(15000);
      socket.on('data', onData);
      socket.on('error', (err) => finish(false, `Socket connection error: ${err.message}`));
      socket.on('timeout', () => finish(false, 'SMTP connection timed out after 15 seconds.'));
    } catch (err: unknown) {
      finish(false, err instanceof Error ? err.message : String(err));
    }
  });
}
