// eslint-disable-next-line @typescript-eslint/no-var-requires
import io = require('socket.io-client');
import { EventEmitter } from 'events';
import { HelkiTokenManager } from './HelkiTokenManager';
import { HelkiSocketUpdate } from './types';

type Socket = ReturnType<typeof io>;

const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 60000;

export class HelkiSocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;

  constructor(
    private readonly apiBase: string,
    private readonly tokenManager: HelkiTokenManager,
    private readonly deviceId: string
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    const token = await this.tokenManager.getToken();

    this.socket = io(this.apiBase, {
      query: { token, dev_id: this.deviceId },
      transports: ['websocket'],
      reconnection: false, // We handle reconnection ourselves
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.startPing();
      this.socket!.emit('dev_data');
      this.emit('connected');
    });

    this.socket.on('update', (data: HelkiSocketUpdate) => {
      this.emit('update', data);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.stopPing();
      this.emit('disconnected', reason);
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error: Error) => {
      this.emit('error', error);
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    this.destroyed = true;
    this.stopPing();
    this.clearReconnectTimer();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('max_reconnect_reached');
      return;
    }

    this.clearReconnectTimer();
    const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        await this.connect();
      } catch (error) {
        this.emit('error', error);
        this.scheduleReconnect();
      }
    }, delay);
  }
}
