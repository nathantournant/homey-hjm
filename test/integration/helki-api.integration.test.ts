/**
 * Integration tests for the Helki API.
 *
 * These tests hit the REAL Helki API and require valid credentials.
 * They are skipped by default and only run when env vars are set:
 *
 *   HELKI_USERNAME=your@email.com HELKI_PASSWORD=yourpassword npm run test:integration
 *
 * Optional env vars:
 *   HELKI_API_BASE  - API host (default: https://api-hjm.helki.com)
 */

import { HelkiApiClient } from '../../lib/HelkiApiClient';

const HELKI_USERNAME = process.env.HELKI_USERNAME;
const HELKI_PASSWORD = process.env.HELKI_PASSWORD;
const HELKI_API_BASE = process.env.HELKI_API_BASE || 'https://api-hjm.helki.com';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(!!HELKI_USERNAME && !!HELKI_PASSWORD)(
  'Helki API Integration',
  () => {
    let client: HelkiApiClient;

    beforeAll(async () => {
      client = new HelkiApiClient(HELKI_API_BASE);
      await client.authenticate(HELKI_USERNAME!, HELKI_PASSWORD!);
    });

    it('should authenticate successfully', () => {
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should list devices', async () => {
      const devices = await client.getDevices();
      expect(Array.isArray(devices)).toBe(true);
      console.log('Devices found:', devices.length);

      for (const device of devices) {
        expect(device.dev_id).toBeDefined();
        expect(device.name).toBeDefined();
        console.log(`  - ${device.name} (${device.dev_id})`);
      }
    });

    it('should list nodes for each device', async () => {
      const devices = await client.getDevices();

      for (const device of devices) {
        const nodes = await client.getNodes(device.dev_id);
        expect(Array.isArray(nodes)).toBe(true);
        console.log(`Nodes for ${device.name}:`, nodes.length);

        for (const node of nodes) {
          expect(typeof node.addr).toBe('number');
          expect(node.type).toBeDefined();
          console.log(`  - ${node.name} (type: ${node.type}, addr: ${node.addr})`);
        }
      }
    });

    it('should get status for heater nodes with numeric temperatures', async () => {
      const devices = await client.getDevices();

      for (const device of devices) {
        const nodes = await client.getNodes(device.dev_id);
        const heaters = nodes.filter((n) => n.type === 'htr');

        for (const heater of heaters) {
          const status = await client.getNodeStatus(
            device.dev_id,
            heater.type,
            heater.addr
          );

          // Verify parsing worked: should be numbers, not strings
          expect(typeof status.stemp).toBe('number');
          expect(typeof status.mtemp).toBe('number');
          expect(status.mode).toBeDefined();
          expect(!isNaN(status.stemp)).toBe(true);
          expect(!isNaN(status.mtemp)).toBe(true);

          console.log(
            `  ${heater.name}: ${status.mtemp}°C (target: ${status.stemp}°C, mode: ${status.mode})`
          );
        }
      }
    });

    it('should refresh token after invalidation', async () => {
      // Force token invalidation
      client.getTokenManager().invalidate();
      expect(client.isAuthenticated()).toBe(false);

      // Next API call should auto-refresh
      const devices = await client.getDevices();
      expect(Array.isArray(devices)).toBe(true);
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should get away status for first device', async () => {
      const devices = await client.getDevices();
      if (devices.length === 0) {
        console.log('No devices found, skipping away status test');
        return;
      }

      const awayStatus = await client.getAwayStatus(devices[0].dev_id);
      expect(typeof awayStatus.away).toBe('boolean');
      expect(typeof awayStatus.enabled).toBe('boolean');
      console.log(`Away status for ${devices[0].name}:`, awayStatus);
    });

    it('should throw on invalid device ID', async () => {
      await expect(
        client.getNodes('non-existent-device-12345')
      ).rejects.toThrow();
    });

    it('should handle no-op setNodeStatus (write current value back)', async () => {
      const devices = await client.getDevices();
      if (devices.length === 0) return;

      const nodes = await client.getNodes(devices[0].dev_id);
      const heater = nodes.find((n) => n.type === 'htr');
      if (!heater) return;

      const status = await client.getNodeStatus(
        devices[0].dev_id,
        heater.type,
        heater.addr
      );

      // Write the same mode back — should be a no-op
      await client.setNodeStatus(devices[0].dev_id, heater.type, heater.addr, {
        mode: status.mode,
      });

      // Verify unchanged
      const statusAfter = await client.getNodeStatus(
        devices[0].dev_id,
        heater.type,
        heater.addr
      );
      expect(statusAfter.mode).toBe(status.mode);
    });
  }
);

// Always have at least one test so Jest doesn't complain
describe('Integration test setup', () => {
  it('should skip when credentials are not provided', () => {
    if (!HELKI_USERNAME || !HELKI_PASSWORD) {
      console.log(
        'Skipping integration tests. Set HELKI_USERNAME and HELKI_PASSWORD to run.'
      );
    }
    expect(true).toBe(true);
  });
});
