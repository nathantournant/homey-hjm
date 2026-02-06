import Homey from 'homey';
import { HelkiApiClient } from './lib/HelkiApiClient';

class HJMApp extends Homey.App {
  public api!: HelkiApiClient;

  async onInit(): Promise<void> {
    this.api = new HelkiApiClient();

    // Restore credentials if available
    const credentials = this.homey.settings.get('credentials');
    if (credentials) {
      try {
        await this.api.authenticate(credentials.username, credentials.password);
        this.log('Restored session from stored credentials');
      } catch (error) {
        this.error('Failed to restore session:', error);
      }
    }

    this.registerFlowCards();

    this.log('HJM Radiator app initialized');
  }

  private registerFlowCards(): void {
    // Action: Set temperature
    this.homey.flow
      .getActionCard('set_temperature')
      .registerRunListener(async (args) => {
        const device = args.device;
        await device.triggerCapabilityListener('target_temperature', args.temperature);
      });

    // Action: Set mode
    this.homey.flow
      .getActionCard('set_mode')
      .registerRunListener(async (args) => {
        const device = args.device;
        await device.triggerCapabilityListener('hjm_mode', args.mode);
      });

    // Condition: Temperature is above/below
    this.homey.flow
      .getConditionCard('temperature_is')
      .registerRunListener(async (args) => {
        const currentTemp = args.device.getCapabilityValue('measure_temperature');
        return currentTemp > args.temperature;
      });

    // Condition: Mode is
    this.homey.flow
      .getConditionCard('mode_is')
      .registerRunListener(async (args) => {
        const currentMode = args.device.getCapabilityValue('hjm_mode');
        return currentMode === args.mode;
      });
  }
}

module.exports = HJMApp;
