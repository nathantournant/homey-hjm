import Homey from 'homey';
import { HelkiApiClient } from '../../lib/HelkiApiClient';
import { HelkiSocketClient } from '../../lib/HelkiSocketClient';
import { DeviceData, HelkiNodeStatus, HelkiSocketUpdate } from '../../lib/types';

const POLL_INTERVAL_MS = 60000;

class HJMRadiatorDevice extends Homey.Device {
  private api!: HelkiApiClient;
  private socketClient: HelkiSocketClient | null = null;
  private pollInterval!: ReturnType<typeof setInterval>;

  async onInit(): Promise<void> {
    this.api = (this.homey.app as any).api;

    this.registerCapabilityListener(
      'target_temperature',
      async (value: number) => {
        await this.setTargetTemperature(value);
      }
    );

    this.registerCapabilityListener('hjm_mode', async (value: string) => {
      await this.setMode(value);
    });

    // Start polling (fallback for when socket is disconnected)
    this.pollInterval = this.homey.setInterval(
      () => this.pollStatus().catch((e) => this.error('Poll failed:', e)),
      POLL_INTERVAL_MS
    );

    // Connect socket for real-time updates
    await this.connectSocket().catch((e) =>
      this.error('Socket connect failed:', e)
    );

    // Initial status fetch
    await this.pollStatus().catch((e) => this.error('Initial poll failed:', e));

    this.log('HJM Radiator initialized:', this.getName());
  }

  async onUninit(): Promise<void> {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
    }
    if (this.socketClient) {
      this.socketClient.disconnect();
      this.socketClient = null;
    }
    this.log('HJM Radiator uninitialized:', this.getName());
  }

  async onDeleted(): Promise<void> {
    await this.onUninit();
  }

  private async connectSocket(): Promise<void> {
    const { deviceId } = this.getData() as DeviceData;
    const tokenManager = this.api.getTokenManager();

    this.socketClient = new HelkiSocketClient(
      'https://api-hjm.helki.com',
      tokenManager,
      deviceId
    );

    this.socketClient.on('update', (data: HelkiSocketUpdate) => {
      this.handleSocketUpdate(data).catch((e) =>
        this.error('Socket update handling failed:', e)
      );
    });

    this.socketClient.on('connected', () => {
      this.log('Socket connected for', this.getName());
    });

    this.socketClient.on('disconnected', (reason: string) => {
      this.log('Socket disconnected:', reason);
    });

    this.socketClient.on('error', (error: Error) => {
      this.error('Socket error:', error.message);
    });

    this.socketClient.on('max_reconnect_reached', () => {
      this.error('Max reconnect attempts reached, falling back to polling');
    });

    await this.socketClient.connect();
  }

  private async handleSocketUpdate(data: HelkiSocketUpdate): Promise<void> {
    const { nodeAddr, nodeType } = this.getData() as DeviceData;

    if (!data.nodes) return;

    const node = data.nodes.find(
      (n) => n.addr === nodeAddr && n.type === nodeType
    );
    if (!node?.status) return;

    await this.updateCapabilities(node.status as HelkiNodeStatus);
  }

  private async pollStatus(): Promise<void> {
    try {
      const { deviceId, nodeType, nodeAddr } = this.getData() as DeviceData;
      const status = await this.api.getNodeStatus(deviceId, nodeType, nodeAddr);
      await this.updateCapabilities(status);

      if (!this.getAvailable()) {
        await this.setAvailable();
      }
    } catch (error) {
      this.error('Poll failed:', error);
      await this.setUnavailable('Connection lost').catch(() => {});
    }
  }

  private async updateCapabilities(status: HelkiNodeStatus): Promise<void> {
    const prevTemp = this.getCapabilityValue('measure_temperature');
    const prevMode = this.getCapabilityValue('hjm_mode');

    if (status.stemp !== undefined) {
      await this.setCapabilityValue('measure_temperature', status.stemp).catch(
        (e) => this.error('Set measure_temperature failed:', e)
      );
    }

    if (status.mtemp !== undefined) {
      await this.setCapabilityValue('target_temperature', status.mtemp).catch(
        (e) => this.error('Set target_temperature failed:', e)
      );
    }

    if (status.mode !== undefined) {
      await this.setCapabilityValue('hjm_mode', status.mode).catch((e) =>
        this.error('Set hjm_mode failed:', e)
      );
    }

    // Trigger flow cards on changes
    if (status.stemp !== undefined && status.stemp !== prevTemp) {
      await this.homey.flow
        .getDeviceTriggerCard('temperature_changed')
        .trigger(this, { temperature: status.stemp })
        .catch((e) => this.error('Trigger temperature_changed failed:', e));
    }

    if (status.mode !== undefined && status.mode !== prevMode) {
      await this.homey.flow
        .getDeviceTriggerCard('mode_changed')
        .trigger(this, { mode: status.mode })
        .catch((e) => this.error('Trigger mode_changed failed:', e));
    }
  }

  private async setTargetTemperature(value: number): Promise<void> {
    const { deviceId, nodeType, nodeAddr } = this.getData() as DeviceData;
    await this.api.setNodeStatus(deviceId, nodeType, nodeAddr, {
      mtemp: value,
    });
    this.log('Set temperature to', value);
  }

  private async setMode(value: string): Promise<void> {
    const { deviceId, nodeType, nodeAddr } = this.getData() as DeviceData;
    await this.api.setNodeStatus(deviceId, nodeType, nodeAddr, {
      mode: value,
    });
    this.log('Set mode to', value);
  }
}

module.exports = HJMRadiatorDevice;
