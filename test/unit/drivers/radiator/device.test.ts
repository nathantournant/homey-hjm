import { createHomeyMock } from '../../mocks/homey.mock';

// Mock socket.io-client before importing device
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
  };
  return { io: jest.fn(() => mockSocket), __mockSocket: mockSocket };
});

// Mock the API client
const mockGetNodeStatus = jest.fn();
const mockSetNodeStatus = jest.fn();
const mockGetTokenManager = jest.fn(() => ({
  getToken: jest.fn().mockResolvedValue('test-token'),
}));

jest.mock('../../../../lib/HelkiApiClient', () => ({
  HelkiApiClient: jest.fn().mockImplementation(() => ({
    getNodeStatus: mockGetNodeStatus,
    setNodeStatus: mockSetNodeStatus,
    getTokenManager: mockGetTokenManager,
  })),
}));

// We need to test the device class directly, so we require it after mocking
const HJMRadiatorDevice = require('../../../../drivers/radiator/device');

describe('HJMRadiatorDevice', () => {
  let device: any;
  let homeyMock: ReturnType<typeof createHomeyMock>;
  let triggerMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    homeyMock = createHomeyMock();
    triggerMock = jest.fn().mockResolvedValue(undefined);
    homeyMock.flow.getDeviceTriggerCard = jest.fn(() => ({
      trigger: triggerMock,
    }));

    device = Object.create(HJMRadiatorDevice.prototype);
    device.homey = homeyMock;
    const apiMock = {
      getNodeStatus: mockGetNodeStatus,
      setNodeStatus: mockSetNodeStatus,
      getTokenManager: mockGetTokenManager,
    };
    device.homey.app = { api: apiMock };
    // pollStatus/setTargetTemperature/setMode use this.api (set in onInit)
    (device as any).api = apiMock;
    device.log = jest.fn();
    device.error = jest.fn();
    device.getName = jest.fn(() => 'Test Radiator');
    device.getData = jest.fn(() => ({
      deviceId: 'smartbox-001',
      nodeType: 'htr',
      nodeAddr: 1,
    }));
    device.getAvailable = jest.fn(() => true);
    device.setAvailable = jest.fn().mockResolvedValue(undefined);
    device.setUnavailable = jest.fn().mockResolvedValue(undefined);
    device.getCapabilityValue = jest.fn(() => null);
    device.setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    device.registerCapabilityListener = jest.fn();
  });

  afterEach(() => {
    homeyMock.__cleanup();
  });

  describe('pollStatus', () => {
    it('should fetch status and update capabilities with parsed numbers', async () => {
      mockGetNodeStatus.mockResolvedValue({
        stemp: 21.5,
        mtemp: 22.0,
        mode: 'auto',
        active: true,
      });

      // Call the private method via prototype
      await device.pollStatus.call(device);

      expect(mockGetNodeStatus).toHaveBeenCalledWith('smartbox-001', 'htr', 1);
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'measure_temperature',
        21.5
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'target_temperature',
        22.0
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'hjm_mode',
        'auto'
      );
    });

    it('should set device unavailable on API error', async () => {
      mockGetNodeStatus.mockRejectedValue(new Error('Network error'));

      await device.pollStatus.call(device);

      expect(device.error).toHaveBeenCalled();
      expect(device.setUnavailable).toHaveBeenCalledWith('Connection lost');
    });

    it('should restore availability after successful poll', async () => {
      device.getAvailable.mockReturnValue(false);
      mockGetNodeStatus.mockResolvedValue({
        stemp: 20.0,
        mtemp: 21.0,
        mode: 'manual',
        active: false,
      });

      await device.pollStatus.call(device);

      expect(device.setAvailable).toHaveBeenCalled();
    });
  });

  describe('updateCapabilities', () => {
    it('should trigger temperature_changed flow card when temp changes', async () => {
      device.getCapabilityValue.mockImplementation((cap: string) => {
        if (cap === 'measure_temperature') return 20.0;
        if (cap === 'hjm_mode') return 'auto';
        return null;
      });

      await device.updateCapabilities.call(device, {
        stemp: 21.5,
        mtemp: 22.0,
        mode: 'auto',
      });

      expect(homeyMock.flow.getDeviceTriggerCard).toHaveBeenCalledWith(
        'temperature_changed'
      );
      expect(triggerMock).toHaveBeenCalledWith(device, {
        temperature: 21.5,
      });
    });

    it('should trigger mode_changed flow card when mode changes', async () => {
      device.getCapabilityValue.mockImplementation((cap: string) => {
        if (cap === 'measure_temperature') return 21.5;
        if (cap === 'hjm_mode') return 'auto';
        return null;
      });

      await device.updateCapabilities.call(device, {
        stemp: 21.5,
        mode: 'manual',
      });

      expect(homeyMock.flow.getDeviceTriggerCard).toHaveBeenCalledWith(
        'mode_changed'
      );
      expect(triggerMock).toHaveBeenCalledWith(device, { mode: 'manual' });
    });

    it('should NOT trigger flow cards when values are unchanged', async () => {
      device.getCapabilityValue.mockImplementation((cap: string) => {
        if (cap === 'measure_temperature') return 21.5;
        if (cap === 'hjm_mode') return 'auto';
        return null;
      });

      await device.updateCapabilities.call(device, {
        stemp: 21.5,
        mode: 'auto',
      });

      // getDeviceTriggerCard should not have been called
      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('should skip NaN temperatures', async () => {
      await device.updateCapabilities.call(device, {
        stemp: NaN,
        mtemp: NaN,
      });

      expect(device.setCapabilityValue).not.toHaveBeenCalledWith(
        'measure_temperature',
        expect.anything()
      );
    });
  });

  describe('handleSocketUpdate', () => {
    it('should parse string temps from socket and update capabilities', async () => {
      const socketData = {
        nodes: [
          {
            addr: 1,
            type: 'htr',
            status: { stemp: '23.5', mtemp: '24.0', mode: 'manual', active: true },
          },
        ],
      };

      await device.handleSocketUpdate.call(device, socketData);

      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'measure_temperature',
        23.5
      );
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'target_temperature',
        24.0
      );
    });

    it('should ignore updates for other nodes', async () => {
      const socketData = {
        nodes: [
          {
            addr: 99,
            type: 'htr',
            status: { stemp: '30.0' },
          },
        ],
      };

      await device.handleSocketUpdate.call(device, socketData);

      expect(device.setCapabilityValue).not.toHaveBeenCalled();
    });

    it('should ignore updates with no nodes', async () => {
      await device.handleSocketUpdate.call(device, {});
      expect(device.setCapabilityValue).not.toHaveBeenCalled();
    });
  });

  describe('setTargetTemperature', () => {
    it('should call API with correct parameters', async () => {
      mockSetNodeStatus.mockResolvedValue(undefined);

      await device.setTargetTemperature.call(device, 23.5);

      expect(mockSetNodeStatus).toHaveBeenCalledWith(
        'smartbox-001',
        'htr',
        1,
        { mtemp: 23.5 }
      );
    });
  });

  describe('setMode', () => {
    it('should call API with correct parameters', async () => {
      mockSetNodeStatus.mockResolvedValue(undefined);

      await device.setMode.call(device, 'self_learn');

      expect(mockSetNodeStatus).toHaveBeenCalledWith(
        'smartbox-001',
        'htr',
        1,
        { mode: 'self_learn' }
      );
    });
  });
});
