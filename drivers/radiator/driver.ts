import Homey from 'homey';
import { HelkiApiClient } from '../../lib/HelkiApiClient';

interface PairDevice {
  name: string;
  data: Record<string, string | number>;
  store?: Record<string, string>;
}

class HJMRadiatorDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('HJM Radiator driver initialized');
  }

  async onPairListDevices(): Promise<PairDevice[]> {
    const api = (this.homey.app as any).api as HelkiApiClient;

    if (!api.isAuthenticated()) {
      throw new Error('Not authenticated. Please log in first.');
    }

    const devices = await api.getDevices();
    const homeyDevices: PairDevice[] = [];

    for (const device of devices) {
      const nodes = await api.getNodes(device.dev_id);

      for (const node of nodes) {
        if (node.type !== 'htr') continue;

        homeyDevices.push({
          name: node.name || `${device.name} - ${node.addr}`,
          data: {
            deviceId: device.dev_id,
            nodeType: node.type,
            nodeAddr: node.addr,  // number from API
          },
          store: {
            deviceName: device.name,
          },
        });
      }
    }

    return homeyDevices;
  }

  async onPair(session: any): Promise<void> {
    const api = (this.homey.app as any).api as HelkiApiClient;

    session.setHandler(
      'login',
      async (data: { username: string; password: string }) => {
        try {
          await api.authenticate(data.username, data.password);
          this.homey.settings.set('credentials', {
            username: data.username,
            password: data.password,
          });
          return true;
        } catch (error: any) {
          throw new Error(error.message || 'Login failed');
        }
      }
    );

    session.setHandler('list_devices', async () => {
      return this.onPairListDevices();
    });
  }
}

module.exports = HJMRadiatorDriver;
