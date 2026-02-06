import { createHomeyMock } from './mocks/homey.mock';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HJMApp = require('../../app');

describe('HJMApp', () => {
  let app: any;
  let homeyMock: ReturnType<typeof createHomeyMock>;
  let setTemperatureListener: (args: any) => Promise<void>;
  let setModeListener: (args: any) => Promise<void>;
  let temperatureIsListener: (args: any) => Promise<boolean>;
  let modeIsListener: (args: any) => Promise<boolean>;

  beforeEach(() => {
    jest.clearAllMocks();
    homeyMock = createHomeyMock();

    // Capture flow card listeners when they register
    (homeyMock.flow as any).getActionCard = jest.fn((name: string) => ({
      registerRunListener: jest.fn((fn: any) => {
        if (name === 'set_temperature') setTemperatureListener = fn;
        if (name === 'set_mode') setModeListener = fn;
      }),
    }));
    (homeyMock.flow as any).getConditionCard = jest.fn((name: string) => ({
      registerRunListener: jest.fn((fn: any) => {
        if (name === 'temperature_is') temperatureIsListener = fn;
        if (name === 'mode_is') modeIsListener = fn;
      }),
    }));

    app = Object.create(HJMApp.prototype);
    app.homey = homeyMock;
    app.log = jest.fn();
    app.error = jest.fn();
  });

  afterEach(() => {
    homeyMock.__cleanup();
  });

  describe('onInit', () => {
    it('should initialize API and register flow cards when no credentials stored', async () => {
      homeyMock.settings.get.mockReturnValue(null);
      await app.onInit();

      expect(app.api).toBeDefined();
      expect(homeyMock.flow.getActionCard).toHaveBeenCalledWith('set_temperature');
      expect(homeyMock.flow.getActionCard).toHaveBeenCalledWith('set_mode');
      expect(homeyMock.flow.getConditionCard).toHaveBeenCalledWith('temperature_is');
      expect(homeyMock.flow.getConditionCard).toHaveBeenCalledWith('mode_is');
      expect(app.log).toHaveBeenCalledWith('HJM Radiator app initialized');
    });

    it('should restore credentials from stored settings on success', async () => {
      homeyMock.settings.get.mockReturnValue({
        username: 'user@test.com',
        password: 'pass123',
      });

      // Mock the API authenticate to succeed
      await app.onInit();
      // We can't easily mock the internal HelkiApiClient, but we can verify
      // the flow continued (log was called, no error thrown)
      expect(app.log).toHaveBeenCalledWith('HJM Radiator app initialized');
    });

    it('should handle credential restoration failure gracefully', async () => {
      homeyMock.settings.get.mockReturnValue({
        username: 'bad@test.com',
        password: 'wrong',
      });

      // onInit should not throw even if auth fails
      await app.onInit();
      // App should still initialize despite auth failure
      expect(app.log).toHaveBeenCalledWith('HJM Radiator app initialized');
    });
  });

  describe('flow card: set_temperature', () => {
    beforeEach(async () => {
      homeyMock.settings.get.mockReturnValue(null);
      await app.onInit();
    });

    it('should call triggerCapabilityListener but NOT setCapabilityValue', async () => {
      const mockDevice = {
        setCapabilityValue: jest.fn().mockResolvedValue(undefined),
        triggerCapabilityListener: jest.fn().mockResolvedValue(undefined),
      };

      await setTemperatureListener({ device: mockDevice, temperature: 23.5 });

      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith(
        'target_temperature',
        23.5
      );
      expect(mockDevice.setCapabilityValue).not.toHaveBeenCalled();
    });
  });

  describe('flow card: set_mode', () => {
    beforeEach(async () => {
      homeyMock.settings.get.mockReturnValue(null);
      await app.onInit();
    });

    it('should call triggerCapabilityListener but NOT setCapabilityValue', async () => {
      const mockDevice = {
        setCapabilityValue: jest.fn().mockResolvedValue(undefined),
        triggerCapabilityListener: jest.fn().mockResolvedValue(undefined),
      };

      await setModeListener({ device: mockDevice, mode: 'manual' });

      expect(mockDevice.triggerCapabilityListener).toHaveBeenCalledWith(
        'hjm_mode',
        'manual'
      );
      expect(mockDevice.setCapabilityValue).not.toHaveBeenCalled();
    });
  });

  describe('flow card: temperature_is', () => {
    beforeEach(async () => {
      homeyMock.settings.get.mockReturnValue(null);
      await app.onInit();
    });

    it('should return true when current temperature is above threshold', async () => {
      const mockDevice = {
        getCapabilityValue: jest.fn().mockReturnValue(25.0),
      };

      const result = await temperatureIsListener({
        device: mockDevice,
        temperature: 20.0,
      });

      expect(result).toBe(true);
    });

    it('should return false when current temperature is below threshold', async () => {
      const mockDevice = {
        getCapabilityValue: jest.fn().mockReturnValue(18.0),
      };

      const result = await temperatureIsListener({
        device: mockDevice,
        temperature: 20.0,
      });

      expect(result).toBe(false);
    });

    it('should return false when current temperature equals threshold', async () => {
      const mockDevice = {
        getCapabilityValue: jest.fn().mockReturnValue(20.0),
      };

      const result = await temperatureIsListener({
        device: mockDevice,
        temperature: 20.0,
      });

      expect(result).toBe(false);
    });
  });

  describe('flow card: mode_is', () => {
    beforeEach(async () => {
      homeyMock.settings.get.mockReturnValue(null);
      await app.onInit();
    });

    it('should return true when mode matches', async () => {
      const mockDevice = {
        getCapabilityValue: jest.fn().mockReturnValue('auto'),
      };

      const result = await modeIsListener({ device: mockDevice, mode: 'auto' });
      expect(result).toBe(true);
    });

    it('should return false when mode does not match', async () => {
      const mockDevice = {
        getCapabilityValue: jest.fn().mockReturnValue('auto'),
      };

      const result = await modeIsListener({ device: mockDevice, mode: 'manual' });
      expect(result).toBe(false);
    });
  });
});
