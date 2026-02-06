const intervals: ReturnType<typeof setInterval>[] = [];
const timeouts: ReturnType<typeof setTimeout>[] = [];

export function createHomeyMock() {
  return {
    settings: {
      get: jest.fn(),
      set: jest.fn(),
    },
    setInterval: jest.fn((fn: () => void, ms: number) => {
      const id = setInterval(fn, ms);
      intervals.push(id);
      return id;
    }),
    clearInterval: jest.fn((id: ReturnType<typeof setInterval>) => {
      clearInterval(id);
    }),
    setTimeout: jest.fn((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    }),
    clearTimeout: jest.fn((id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    }),
    emit: jest.fn(),
    on: jest.fn(),
    flow: {
      getActionCard: jest.fn(() => ({
        registerRunListener: jest.fn(),
      })),
      getConditionCard: jest.fn(() => ({
        registerRunListener: jest.fn(),
      })),
      getDeviceTriggerCard: jest.fn(() => ({
        trigger: jest.fn().mockResolvedValue(undefined),
      })),
    },
    app: {},
    __cleanup: () => {
      intervals.forEach(clearInterval);
      timeouts.forEach(clearTimeout);
      intervals.length = 0;
      timeouts.length = 0;
    },
  };
}

// Default export for module mapping
const defaultMock = {
  App: class MockApp {
    homey = createHomeyMock();
    log = jest.fn();
    error = jest.fn();
  },
  Device: class MockDevice {
    homey = createHomeyMock();
    log = jest.fn();
    error = jest.fn();
    getData = jest.fn();
    getName = jest.fn(() => 'Test Device');
    getAvailable = jest.fn(() => true);
    setAvailable = jest.fn().mockResolvedValue(undefined);
    setUnavailable = jest.fn().mockResolvedValue(undefined);
    getCapabilityValue = jest.fn();
    setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    registerCapabilityListener = jest.fn();
    triggerCapabilityListener = jest.fn().mockResolvedValue(undefined);
  },
  Driver: class MockDriver {
    homey = createHomeyMock();
    log = jest.fn();
    error = jest.fn();
  },
};

export default defaultMock;
