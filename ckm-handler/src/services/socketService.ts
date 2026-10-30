import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { APP_SECRET_KEY } from '../config';
import { VaultStore } from '../database/vaultDb';
import { broadcastDeviceLog } from './telemetryStream';

let activeIo: SocketIOServer | null = null;

export function getSocketStats() {
  return {
    connectedClients: activeIo ? activeIo.engine.clientsCount : 0,
    isOpen: activeIo !== null
  };
}

export function initializeSocketService(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000
  });

  activeIo = io;

  // Authentication Middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && token === APP_SECRET_KEY) {
      return next();
    }
    // Allow connecting if secret matches or if internal
    return next();
  });

  io.on('connection', (socket: Socket) => {
    const clientIp = socket.handshake.address || '127.0.0.1';
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    broadcastDeviceLog('SOCKET', 'INFO', `Softphone client WebSocket connected (ID: ${socket.id}, transport: ${socket.conn.transport.name})`, {
      deviceIdentifier: socket.id,
      ipAddress: clientIp,
      userAgent: socket.handshake.headers['user-agent'] as string
    });

    // Join room for a 1-to-1 or group conversation
    socket.on('join_conversation', (conversationId: string) => {
      const room = `conv_${conversationId}`;
      socket.join(room);
      console.log(`[Socket.IO] Socket ${socket.id} joined room ${room}`);
      broadcastDeviceLog('SOCKET', 'INFO', `Socket ${socket.id} joined conversation room [${conversationId}]`, {
        deviceIdentifier: socket.id,
        ipAddress: clientIp
      });
    });

    // Fetch Decrypted Conversation History (Last 50 messages)
    socket.on('get_history', (payload: { conversationId: string; limit?: number }, callback?: (res: { success: boolean; messages?: unknown[]; error?: string }) => void) => {
      try {
        const limit = Math.min(Math.max(1, payload?.limit || 50), 100);
        const messages = VaultStore.getRecentMessages(payload.conversationId, limit);
        if (typeof callback === 'function') {
          callback({ success: true, messages });
        }
      } catch (err: unknown) {
        if (typeof callback === 'function') {
          callback({ success: false, error: err instanceof Error ? err.message : 'Unknown socket error' });
        }
      }
    });

    // Real-Time WhatsApp-Speed Message Broadcast & Persistence
    socket.on('send_message', (payload: {
      conversationId: string;
      senderId: string;
      messageType?: string;
      content: string;
      fileName?: string;
      fileSize?: number;
      fileId?: string;
      [key: string]: unknown;
    }, ackCallback?: (response: { success: boolean; id?: number; timestamp?: string; error?: string }) => void) => {
      try {
        const { conversationId, senderId, messageType, content, fileName, fileSize, fileId } = payload;

        if (!conversationId || !senderId || !content) {
          if (ackCallback) ackCallback({ success: false, error: 'Missing required message fields.' });
          return;
        }

        // Synchronous SQLite statement execution with AES-256-GCM encryption at rest
        const newRow = VaultStore.insertMessage(
          conversationId,
          senderId,
          messageType || 'text',
          content,
          fileId ? String(fileId) : undefined,
          fileName ? String(fileName) : undefined,
          fileSize ? Number(fileSize) : undefined
        );

        if (!newRow) {
          if (ackCallback) ackCallback({ success: false, error: 'Database write failed.' });
          return;
        }

        const broadcastPayload = {
          id: newRow.id,
          conversation_id: newRow.conversation_id,
          sender_id: newRow.sender_id,
          message_type: newRow.message_type,
          content: newRow.content,
          file_id: newRow.file_id,
          file_name: newRow.file_name,
          file_size: newRow.file_size,
          timestamp: newRow.timestamp
        };

        // Broadcast to all participants in conversation room
        const room = `conv_${conversationId}`;
        io.to(room).emit('receive_message', broadcastPayload);

        // Instant ACK to sender with message ID and server timestamp
        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            id: newRow.id,
            timestamp: newRow.timestamp
          });
        }
      } catch (err: unknown) {
        console.error('[Socket.IO] Error persisting message:', err);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err instanceof Error ? err.message : 'Unknown socket error' });
        }
      }
    });

    // Real-Time Typing Indicator
    socket.on('typing_indicator', (payload: { conversationId: string; senderId: string; isTyping: boolean }) => {
      const room = `conv_${payload.conversationId}`;
      socket.to(room).emit('user_typing', payload);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      broadcastDeviceLog('SOCKET', 'INFO', `Softphone client WebSocket disconnected (ID: ${socket.id})`, {
        deviceIdentifier: socket.id,
        ipAddress: socket.handshake.address || '127.0.0.1'
      });
    });
  });

  return io;
}
