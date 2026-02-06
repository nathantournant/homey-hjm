import nock from 'nock';
import { HelkiApiClient } from '../../../lib/HelkiApiClient';
import devicesFixture from '../../fixtures/devices.json';
import nodesFixture from '../../fixtures/nodes.json';
import statusFixture from '../../fixtures/status.json';

const API_BASE = 'https://api-hjm.helki.com';
const BASIC_AUTH = 'dGVzdDp0ZXN0';

function authScope() {
  return nock(API_BASE)
    .post('/api/v2/client/token')
    .reply(200, {
      access_token: 'test-token',
      expires_in: 14400,
    });
}

describe('HelkiApiClient', () => {
  let client: HelkiApiClient;

  beforeEach(async () => {
    nock.cleanAll();
    client = new HelkiApiClient(API_BASE, BASIC_AUTH);
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
      const newClient = new HelkiApiClient(API_BASE, BASIC_AUTH);
      nock(API_BASE).post('/api/v2/client/token').reply(401);

      await expect(
        newClient.authenticate('bad@test.com', 'wrong')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getDevices', () => {
    it('should return list of devices', async () => {
      nock(API_BASE)
        .get('/api/v2/devs')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, devicesFixture);

      const devices = await client.getDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].dev_id).toBe('smartbox-001');
      expect(devices[0].connected).toBe(true);
    });
  });

  describe('getNodes', () => {
    it('should return nodes for a device', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/nodes')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, nodesFixture);

      const nodes = await client.getNodes('smartbox-001');
      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe('htr');
    });
  });

  describe('getNodeStatus', () => {
    it('should return node status', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/htr/1/status')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, statusFixture);

      const status = await client.getNodeStatus('smartbox-001', 'htr', '1');
      expect(status.stemp).toBe(21.5);
      expect(status.mtemp).toBe(22.0);
      expect(status.mode).toBe('auto');
      expect(status.active).toBe(true);
    });
  });

  describe('setNodeStatus', () => {
    it('should set temperature', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { mtemp: 23.0 })
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', '1', { mtemp: 23.0 })
      ).resolves.toBeUndefined();
    });

    it('should set mode', async () => {
      nock(API_BASE)
        .post('/api/v2/devs/smartbox-001/htr/1/status', { mode: 'manual' })
        .reply(200);

      await expect(
        client.setNodeStatus('smartbox-001', 'htr', '1', { mode: 'manual' })
      ).resolves.toBeUndefined();
    });
  });

  describe('token refresh on 401', () => {
    it('should auto-refresh and retry on 401', async () => {
      // First call returns 401
      nock(API_BASE)
        .get('/api/v2/devs')
        .reply(401);

      // Token refresh
      nock(API_BASE)
        .post('/api/v2/client/token')
        .reply(200, {
          access_token: 'new-token',
          expires_in: 14400,
        });

      // Retry with new token
      nock(API_BASE)
        .get('/api/v2/devs')
        .matchHeader('Authorization', 'Bearer new-token')
        .reply(200, devicesFixture);

      const devices = await client.getDevices();
      expect(devices).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw on rate limit (429)', async () => {
      nock(API_BASE).get('/api/v2/devs').reply(429);

      await expect(client.getDevices()).rejects.toThrow(
        'Too many requests'
      );
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
    it('should return away status', async () => {
      nock(API_BASE)
        .get('/api/v2/devs/smartbox-001/mgr/away_status')
        .reply(200, { away: false, enabled: true });

      const status = await client.getAwayStatus('smartbox-001');
      expect(status.away).toBe(false);
      expect(status.enabled).toBe(true);
    });
  });

  describe('setAwayStatus', () => {
    it('should update away status', async () => {
      nock(API_BASE)
        .put('/api/v2/devs/smartbox-001/mgr/away_status', {
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
