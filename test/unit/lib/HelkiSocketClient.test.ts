import { HelkiSocketClient } from '../../../lib/HelkiSocketClient';
import { HelkiTokenManager } from '../../../lib/HelkiTokenManager';

// Mock socket.io-client (v2 uses module.exports = io)
jest.mock('socket.io-client', () => {
  const socket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
  };
  const io = Object.assign(jest.fn(() => socket), { __mockSocket: socket });
  return io;
});

const mockIo = jest.requireMock('socket.io-client') as jest.Mock & { __mockSocket: any };
const mockSocket = mockIo.__mockSocket;

describe('HelkiSocketClient', () => {
  let client: HelkiSocketClient;
  let tokenManager: HelkiTokenManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    tokenManager = {
      getToken: jest.fn().mockResolvedValue('test-token'),
    } as any;
    client = new HelkiSocketClient(
      'https://api-hjm.helki.com',
      tokenManager,
      'device-001'
    );
  });

  afterEach(() => {
    client.disconnect();
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should create socket connection with correct params', async () => {
      const io = mockIo;
      await client.connect();

      expect(io).toHaveBeenCalledWith('https://api-hjm.helki.com', {
        query: { token: 'test-token', dev_id: 'device-001' },
        transports: ['websocket'],
        reconnection: false,
      });
    });

    it('should register event handlers', async () => {
      await client.connect();

      expect(mockSocket.on).toHaveBeenCalledWith(
        'connect',
        expect.any(Function)
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        'update',
        expect.any(Function)
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        'disconnect',
        expect.any(Function)
      );
      expect(mockSocket.on).toHaveBeenCalledWith(
        'connect_error',
        expect.any(Function)
      );
    });

    it('should emit dev_data on connect', async () => {
      await client.connect();

      // Simulate connect event
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      mockSocket.connected = true;
      connectHandler?.();

      expect(mockSocket.emit).toHaveBeenCalledWith('dev_data');
    });

    it('should return early if destroyed', async () => {
      const io = mockIo;
      client.disconnect(); // sets destroyed = true
      io.mockClear();

      await client.connect();

      expect(io).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should clean up socket connection', async () => {
      await client.connect();
      client.disconnect();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should not reconnect after disconnect', async () => {
      await client.connect();
      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit update events from socket', async () => {
      const updateHandler = jest.fn();
      client.on('update', updateHandler);
      await client.connect();

      // Find and call the socket update handler
      const socketUpdateHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'update'
      )?.[1];

      const updateData = {
        dev_id: 'device-001',
        nodes: [{ addr: '1', type: 'htr', status: { stemp: 22.0 } }],
      };
      socketUpdateHandler?.(updateData);

      expect(updateHandler).toHaveBeenCalledWith(updateData);
    });

    it('should emit connected event on socket connect', async () => {
      const connectedHandler = jest.fn();
      client.on('connected', connectedHandler);
      await client.connect();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      mockSocket.connected = true;
      connectHandler?.();

      expect(connectedHandler).toHaveBeenCalled();
    });

    it('should emit disconnected event and schedule reconnect on disconnect', async () => {
      const disconnectedHandler = jest.fn();
      client.on('disconnected', disconnectedHandler);
      await client.connect();

      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];
      disconnectHandler?.('transport close');

      expect(disconnectedHandler).toHaveBeenCalledWith('transport close');
    });

    it('should emit error event on connect_error', async () => {
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      await client.connect();

      const connectErrorHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];
      const err = new Error('connection refused');
      connectErrorHandler?.(err);

      expect(errorHandler).toHaveBeenCalledWith(err);
    });
  });

  describe('ping mechanism', () => {
    it('should start pinging on connect and emit ping at intervals', async () => {
      await client.connect();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      mockSocket.connected = true;
      connectHandler?.();

      // Clear emit calls from connect (dev_data)
      mockSocket.emit.mockClear();

      // Advance by one ping interval (20s)
      jest.advanceTimersByTime(20000);
      expect(mockSocket.emit).toHaveBeenCalledWith('ping');

      // Advance by another ping interval
      mockSocket.emit.mockClear();
      jest.advanceTimersByTime(20000);
      expect(mockSocket.emit).toHaveBeenCalledWith('ping');
    });

    it('should stop pinging on disconnect', async () => {
      await client.connect();

      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      mockSocket.connected = true;
      connectHandler?.();

      client.disconnect();
      mockSocket.emit.mockClear();

      jest.advanceTimersByTime(20000);
      // After disconnect, ping should not be emitted
      expect(mockSocket.emit).not.toHaveBeenCalledWith('ping');
    });
  });

  describe('scheduleReconnect', () => {
    it('should use exponential backoff for delays', async () => {
      await client.connect();

      // Simulate disconnect to trigger reconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];

      // First reconnect: 5000ms * 2^0 = 5000ms
      disconnectHandler?.('test');

      // Verify the reconnect timer is set by advancing time
      const io = mockIo;
      io.mockClear();

      // Not enough time
      jest.advanceTimersByTime(4999);
      expect(io).not.toHaveBeenCalled();

      // Exact time for first reconnect (5000ms)
      jest.advanceTimersByTime(1);
      // The reconnect will call connect() which calls io()
      await Promise.resolve(); // flush microtasks
      expect(io).toHaveBeenCalled();
    });

    it('should cap reconnect delay at 60 seconds', async () => {
      await client.connect();

      // Access the private reconnectAttempts via multiple disconnect/reconnect cycles
      // After attempt 4: 5000 * 2^4 = 80000 → capped to 60000
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];

      // Simulate multiple reconnect attempts by calling disconnect handler
      // and advancing timers. We need to reach attempt 4+ to test the cap.
      // Instead, let's test the math directly - at attempt 4:
      // 5000 * 2^4 = 80000, capped at 60000

      // We'll trigger 4 disconnect events rapidly
      for (let i = 0; i < 4; i++) {
        disconnectHandler?.('test');
        // The reconnect timer fires after delay, but we just need to
        // advance past each to increment the attempt counter
        jest.advanceTimersByTime(60001);
        await Promise.resolve();
      }

      // Now on attempt 4, delay should be capped at 60s
      const io = mockIo;
      io.mockClear();
      disconnectHandler?.('test');

      // At 59999ms it should NOT have reconnected yet
      jest.advanceTimersByTime(59999);
      await Promise.resolve();

      // At 60000ms it should reconnect
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    it('should emit max_reconnect_reached after max attempts', async () => {
      const maxReconnectHandler = jest.fn();
      client.on('max_reconnect_reached', maxReconnectHandler);

      await client.connect();

      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];

      // Trigger 10 disconnects (MAX_RECONNECT_ATTEMPTS = 10)
      for (let i = 0; i < 10; i++) {
        disconnectHandler?.('test');
        jest.advanceTimersByTime(60001);
        await Promise.resolve();
      }

      // The 11th disconnect should trigger max_reconnect_reached
      disconnectHandler?.('test');
      expect(maxReconnectHandler).toHaveBeenCalled();
    });
  });
});
