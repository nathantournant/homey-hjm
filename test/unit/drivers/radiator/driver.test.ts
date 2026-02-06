import { createHomeyMock } from '../../mocks/homey.mock';

// Mock API client
const mockAuthenticate = jest.fn();
const mockIsAuthenticated = jest.fn(() => true);
const mockGetDevices = jest.fn();
const mockGetNodes = jest.fn();

jest.mock('../../../../lib/HelkiApiClient', () => ({
  HelkiApiClient: jest.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    isAuthenticated: mockIsAuthenticated,
    getDevices: mockGetDevices,
    getNodes: mockGetNodes,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HJMRadiatorDriver = require('../../../../drivers/radiator/driver');

describe('HJMRadiatorDriver', () => {
  let driver: any;
  let homeyMock: ReturnType<typeof createHomeyMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    homeyMock = createHomeyMock();

    driver = Object.create(HJMRadiatorDriver.prototype);
    driver.homey = homeyMock;
    driver.homey.app = {
      api: {
        authenticate: mockAuthenticate,
        isAuthenticated: mockIsAuthenticated,
        getDevices: mockGetDevices,
        getNodes: mockGetNodes,
      },
    };
    driver.log = jest.fn();
    driver.error = jest.fn();
  });

  afterEach(() => {
    homeyMock.__cleanup();
  });

  describe('onPairListDevices', () => {
    it('should return heater nodes as pair devices', async () => {
      mockGetDevices.mockResolvedValue([
        { dev_id: 'sb-001', name: 'Living Room' },
        { dev_id: 'sb-002', name: 'Bedroom' },
      ]);

      mockGetNodes.mockImplementation((deviceId: string) => {
        if (deviceId === 'sb-001') {
          return Promise.resolve([
            { addr: 1, name: 'Living Radiator', type: 'htr', installed: true },
            { addr: 2, name: 'Hallway Thermo', type: 'thm', installed: true },
          ]);
        }
        return Promise.resolve([
          { addr: 1, name: 'Bedroom Radiator', type: 'htr', installed: true },
        ]);
      });

      const devices = await driver.onPairListDevices();

      expect(devices).toHaveLength(2); // Only htr nodes
      expect(devices[0].name).toBe('Living Radiator');
      expect(devices[0].data.deviceId).toBe('sb-001');
      expect(devices[0].data.nodeType).toBe('htr');
      expect(devices[0].data.nodeAddr).toBe(1);
      expect(devices[1].name).toBe('Bedroom Radiator');
      expect(devices[1].data.deviceId).toBe('sb-002');
    });

    it('should filter out non-heater node types', async () => {
      mockGetDevices.mockResolvedValue([
        { dev_id: 'sb-001', name: 'Box' },
      ]);
      mockGetNodes.mockResolvedValue([
        { addr: 1, name: 'Thermostat', type: 'thm' },
        { addr: 2, name: 'Accumulator', type: 'acm' },
        { addr: 3, name: 'Power Monitor', type: 'pmo' },
      ]);

      const devices = await driver.onPairListDevices();
      expect(devices).toHaveLength(0);
    });

    it('should use device name + addr as fallback when node has no name', async () => {
      mockGetDevices.mockResolvedValue([
        { dev_id: 'sb-001', name: 'My SmartBox' },
      ]);
      mockGetNodes.mockResolvedValue([
        { addr: 1, name: '', type: 'htr' },
      ]);

      const devices = await driver.onPairListDevices();
      expect(devices[0].name).toBe('My SmartBox - 1');
    });

    it('should throw if not authenticated', async () => {
      mockIsAuthenticated.mockReturnValue(false);

      await expect(driver.onPairListDevices()).rejects.toThrow(
        'Not authenticated'
      );
    });
  });

  describe('onPair', () => {
    it('should register login and list_devices handlers', async () => {
      const handlers: Record<string, (...args: unknown[]) => unknown> = {};
      const session = {
        setHandler: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          handlers[event] = handler;
        }),
      };

      await driver.onPair(session);

      expect(session.setHandler).toHaveBeenCalledWith(
        'login',
        expect.any(Function)
      );
      expect(session.setHandler).toHaveBeenCalledWith(
        'list_devices',
        expect.any(Function)
      );
    });

    it('should authenticate on login and store credentials', async () => {
      const handlers: Record<string, (...args: unknown[]) => unknown> = {};
      const session = {
        setHandler: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          handlers[event] = handler;
        }),
      };

      mockAuthenticate.mockResolvedValue(undefined);
      await driver.onPair(session);

      const result = await handlers['login']({
        username: 'user@test.com',
        password: 'pass123',
      });

      expect(result).toBe(true);
      expect(mockAuthenticate).toHaveBeenCalledWith('user@test.com', 'pass123');
      expect(homeyMock.settings.set).toHaveBeenCalledWith('credentials', {
        username: 'user@test.com',
        password: 'pass123',
      });
    });

    it('should throw on failed login', async () => {
      const handlers: Record<string, (...args: unknown[]) => unknown> = {};
      const session = {
        setHandler: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          handlers[event] = handler;
        }),
      };

      mockAuthenticate.mockRejectedValue(
        new Error('Invalid credentials. Check your HJM app login.')
      );
      await driver.onPair(session);

      await expect(
        handlers['login']({ username: 'bad@test.com', password: 'wrong' })
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
