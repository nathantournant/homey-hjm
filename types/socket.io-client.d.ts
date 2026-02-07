declare module 'socket.io-client' {
  import { EventEmitter } from 'events';

  interface SocketOptions {
    query?: Record<string, string>;
    transports?: string[];
    reconnection?: boolean;
    forceNew?: boolean;
    timeout?: number;
  }

  interface Socket extends EventEmitter {
    connected: boolean;
    disconnected: boolean;
    id: string;
    connect(): Socket;
    disconnect(): Socket;
    emit(event: string, ...args: unknown[]): Socket;
    on(event: string, fn: (...args: any[]) => void): Socket;
    removeAllListeners(event?: string): Socket;
  }

  function io(uri: string, opts?: SocketOptions): Socket;
  export = io;
}
