import nock from 'nock';
import { HelkiApiClient } from '../../../lib/HelkiApiClient';
import devicesFixture from '../../fixtures/devices.json';
import nodesFixture from '../../fixtures/nodes.json';
import statusFixture from '../../fixtures/status.json';

const API_BASE = 'https://api-hjm.helki.com';

function authScope() {
  return nock(API_BASE)
    .post('/client/token')
    .reply(200, {
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 14400,
      token_type: 'Bearer',
    });
}

describe('HelkiApiClient', () => {
  let client: HelkiApiClient;

  beforeEach(async () => {
    nock.cleanAll();
    client = new HelkiApiClient(API_BASE);
    authScope();
    await client.authenticate('user@test.com', 'password');
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('authenticate', () => {
    it('should authenticate and set isAuthenticated to true', () => {
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should throw user-friendly error on invalid credentials', async () => {
      nock.cleanAll();
      const newClient = new HelkiApiClient(API_BASE);
      nock(API_BASE).post('/client/token').reply(401);

      await expect(
        newClient.authenticate('bad@test.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getApiBase', () => {
    it('should return the configured API base URL', () => {
      expect(client.getApiBase()).toBe(API_BASE);
    });

    it('should use default API base when none provided', () => {
      nock.cleanAll();
      const defaultClient = new HelkiApiClient();
      expect(defaultClient.getApiBase()).toBe('https://api-hjm.helki.com');
    });
  });

  describe('getDevices', () => {
    it('should unwrap and return devs array from wrapped response', async () => {
      nock(API_BASE)
        .get('/api/v2/devs')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, devicesFixture);

      const devices = await client.getDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].dev_id).toBe('smartbox-001');
      expect(devices[0].name).toBe('Living Room SmartBox');
      expect(devices[0].product_id).toBe('hjm_noelle');
    });

    it('should handle empty device list', async () => {
      nock(API_BASE)
        .get('/api/v2/devs')
        .reply(200, { devs: [], invited_to: [] });

      const devices = await client.getDevices();
      expect(devices).toHaveLength(0);
    });
  });

  describe('getNodes', () => {
    it('should unwrap and return nodes array from wrapped response', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/nodes')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, nodesFixture);

      const nodes = await client.getNodes('smartbox-001');
      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe('htr');
      expect(nodes[0].addr).toBe(1);  // number, not string
      expect(nodes[0].installed).toBe(true);
    });
  });

  describe('getNodeStatus', () => {
    it('should parse string temperatures to numbers', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/htr/1/status')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, statusFixture);

      const status = await client.getNodeStatus('smartbox-001', 'htr', 1);
      expect(status.stemp).toBe(21.5);    // parsed from "21.5"
      expect(status.mtemp).toBe(22.0);    // parsed from "22.0"
      expect(typeof status.stemp).toBe('number');
      expect(typeof status.mtemp).toBe('number');
      expect(status.mode).toBe('auto');
      expect(status.active).toBe(true);
    });

    it('should handle integer temperature strings', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/htr/1/status')
        .reply(200, { ...statusFixture, stemp: '20', mtemp: '22' });

      const status = await client.getNodeStatus('smartbox-001', 'htr', 1);
      expect(status.stemp).toBe(20);
      expect(status.mtemp).toBe(22);
    });
  });

  describe('setNodeStatus', () => {
    it('should convert numeric stemp (set/target) to decimal string for API', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { stemp: '23.0', units: 'C' })
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', 1, { stemp: 23 })
      ).resolves.toBeUndefined();
    });

    it('should convert numeric mtemp (measured) to decimal string for API', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { mtemp: '23.0', units: 'C' })
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', 1, { mtemp: 23 })
      ).resolves.toBeUndefined();
    });

    it('should send mode as-is', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { mode: 'manual' })
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', 1, { mode: 'manual' })
      ).resolves.toBeUndefined();
    });

    it('should send active field as-is', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { active: true })
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', 1, { active: true })
      ).resolves.toBeUndefined();
    });

    it('should send combined fields', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', {
          stemp: '22.5',
          mode: 'auto',
          active: false,
          units: 'C',
        })
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', 1, {
          stemp: 22.5,
          mode: 'auto',
          active: false,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('token refresh on 401', () => {
    it('should auto-refresh and retry on 401', async () => {
      nock(API_BASE).get('/api/v2/devs').reply(401);

      nock(API_BASE)
        .post('/client/token')
        .reply(200, {
          access_token: 'new-token',
          expires_in: 14400,
        });

      nock(API_BASE)
        .get('/api/v2/devs')
        .matchHeader('Authorization', 'Bearer new-token')
        .reply(200, devicesFixture);

      const devices = await client.getDevices();
      expect(devices).toHaveLength(2);
    });

    it('should deduplicate concurrent 401 refresh requests (BUG-1)', async () => {
      // Both requests get 401
      nock(API_BASE).get('/api/v2/devs').reply(401);
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/nodes')
        .reply(401);

      // Only ONE token refresh should happen
      nock(API_BASE)
        .post('/client/token')
        .once()
        .reply(200, {
          access_token: 'refreshed-token',
          expires_in: 14400,
        });

      // Retry requests with new token
      nock(API_BASE)
        .get('/api/v2/devs')
        .matchHeader('Authorization', 'Bearer refreshed-token')
        .reply(200, devicesFixture);

      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/nodes')
        .matchHeader('Authorization', 'Bearer refreshed-token')
        .reply(200, nodesFixture);

      const [devices, nodes] = await Promise.all([
        client.getDevices(),
        client.getNodes('smartbox-001'),
      ]);

      expect(devices).toHaveLength(2);
      expect(nodes).toHaveLength(3);
    });
  });

  describe('error handling', () => {
    it('should throw on rate limit (429)', async () => {
      nock(API_BASE).get('/api/v2/devs').reply(429);

      await expect(client.getDevices()).rejects.toThrow('Too many requests');
    });

    it('should throw on connection error', async () => {
      nock(API_BASE)
        .get('/api/v2/devs')
        .replyWithError({ code: 'ECONNREFUSED' });

      await expect(client.getDevices()).rejects.toThrow(
        'Could not connect to HJM cloud'
      );
    });
  });

  describe('getAwayStatus', () => {
    it('should return away status with forced field', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/away_status')
        .reply(200, { away: false, enabled: true, forced: false });

      const status = await client.getAwayStatus('smartbox-001');
      expect(status.away).toBe(false);
      expect(status.enabled).toBe(true);
      expect(status.forced).toBe(false);
    });

    it('should throw on error for invalid device', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/invalid-device/mgr/away_status')
        .reply(404);

      await expect(
        client.getAwayStatus('invalid-device')
      ).rejects.toThrow();
    });
  });

  describe('setAwayStatus', () => {
    it('should update away status', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/mgr/away_status', {
          away: true,
          enabled: true,
        })
        .reply(200);

      await expect(
        client.setAwayStatus('smartbox-001', { away: true, enabled: true })
      ).resolves.toBeUndefined();
    });
  });
});
