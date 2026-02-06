import { HelkiSocketClient } from '../../../lib/HelkiSocketClient';
import { HelkiTokenManager } from '../../../lib/HelkiTokenManager';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
  };
  return {
    io: jest.fn(() => mockSocket),
    __mockSocket: mockSocket,
  };
});

const { __mockSocket: mockSocket } = jest.requireMock('socket.io-client');

describe('HelkiSocketClient', () => {
  let client: HelkiSocketClient;
  let tokenManager: HelkiTokenManager;

  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  describe('connect', () => {
    it('should create socket connection with correct params', async () => {
      const { io } = jest.requireMock('socket.io-client');
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
  });
});
